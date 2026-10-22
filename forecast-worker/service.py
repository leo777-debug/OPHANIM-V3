"""Internal worker, same Postgres ledger as Next.js. No cross-tenant pooling."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread, Event
from uuid import UUID
import hashlib
import hmac
import json
import os
import time
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from panel import VERSION, Panel, fit, save, load_verified, InsufficientHistory, scores, regime_shift, activation_gate
from analysts import autoregressive_forecast

MODEL_ROOT=Path(os.environ.get('MODEL_ROOT','/models'))

def connect():
 return psycopg.connect(os.environ['DATABASE_URL'],row_factory=dict_row)

def iso(value):
 return value.isoformat() if isinstance(value,datetime) else str(value)

def snapshot(c,organization,shipment):
 """Only now: never reconstruct a historical feature vector from mutable live tables."""
 s=c.execute('select * from ophanim_shipments where organization_id=%s and id=%s and archived_at is null',(organization,shipment)).fetchone()
 if not s:raise ValueError('Shipment unavailable')
 now=c.execute('select clock_timestamp() as t').fetchone()['t']
 lane=f"{s['origin_port_code'] or '?'}:{s['destination_port_code'] or '?'}"
 features={'lane':lane,'carrier':s['carrier'],'cargo_type':s['cargo_type'],'season':(now.month-1)//3,
           'historical':s['historical'],'planned_arrival_at':iso(s['planned_arrival_at']) if s['planned_arrival_at'] else None,
           'regime':'unclassified','event_sequence':[],'evidence_ids':[]}
 features['season_index']=(now.month-1)//3
 if s['planned_arrival_at']:
  features['forecast_horizon_hours']=max(0,(s['planned_arrival_at']-now).total_seconds()/3600)
 humans=c.execute("""select distinct on(f.user_id) f.user_id,f.probability,f.id from ophanim_forecasts f
  where f.organization_id=%s and f.shipment_id=%s and f.source_type='human' and f.issued_at<=%s
  order by f.user_id,f.issued_at desc""",(organization,shipment,now)).fetchall()
 accuracy=c.execute("""select f.user_id,count(*) as n,avg(s.brier) as brier from ophanim_forecasts f
  join ophanim_forecast_scores s on s.forecast_id=f.id and s.organization_id=f.organization_id
  where f.organization_id=%s and f.source_type='human' and s.scored_at<=%s and s.brier is not null group by f.user_id""",(organization,now)).fetchall()
 records={r['user_id']:r for r in accuracy}
 if humans:
  weights=[1/(float(records[h['user_id']]['brier'])+.05) if h['user_id'] in records and records[h['user_id']]['n']>=10 else 1 for h in humans]
  features['operator_probability']=sum(h['probability']*w for h,w in zip(humans,weights))/sum(weights)
  features['evidence_ids'].extend(str(h['id']) for h in humans)
 bias=c.execute("""select count(*) as n,avg(extract(epoch from actual_arrival_at-planned_arrival_at)/3600) as gap
  from(select actual_arrival_at,planned_arrival_at from ophanim_shipments where organization_id=%s and carrier is not distinct from %s
   and actual_arrival_at<=%s and planned_arrival_at is not null order by actual_arrival_at desc limit 100)b""",(organization,s['carrier'],now)).fetchone()
 if bias['n']>=10:features['promise_gap_hours']=float(bias['gap'])
 events=c.execute('select id,event_type,occurred_at from ophanim_shipment_events where organization_id=%s and shipment_id=%s and recorded_at<=%s and occurred_at<=%s order by occurred_at',(organization,shipment,now,now)).fetchall()
 features['event_sequence']=[e['event_type'] for e in events]
 if events:features['silence_hours']=max(0,(now-events[-1]['occurred_at']).total_seconds()/3600)
 road=c.execute("""select metadata->'road_legs' as legs from ophanim_routes where organization_id=%s and shipment_id=%s
  and archived_at is null and updated_at<=%s and metadata ? 'road_legs' order by updated_at desc limit 1""",(organization,shipment,now)).fetchone()
 if road and isinstance(road['legs'],dict):
  plans=[p for p in road['legs'].values() if isinstance(p,dict) and p.get('provider')=='valhalla'
   and isinstance(p.get('durationHours'),(int,float)) and 0<=p['durationHours']<=1000]
  if plans:
   features['planned_truck_hours']=sum(p['durationHours'] for p in plans)
   dates=[]
   for p in plans:
    try:
     checked=datetime.fromisoformat(p['checkedAt'].replace('Z','+00:00'))
     if checked<=now:dates.append((now-checked).total_seconds()/3600)
    except (KeyError,ValueError,TypeError):pass
   if dates:features['road_plan_age_hours']=max(dates)
 mentions=c.execute("""select count(distinct m.id) as n,max(x.confidence_contribution) as strongest,max(a.confidence_score) as confidence,
  array_agg(distinct m.id::text) as ids
  from ophanim_dark_web_mentions m join ophanim_mention_entity_matches x on x.mention_id=m.id
  join ophanim_entities e on e.id=x.entity_id and e.organization_id=m.organization_id
  left join ophanim_signal_assessments a on a.mention_id=m.id and a.organization_id=m.organization_id and a.subject_type='shipment' and a.subject_id=%s
  where m.organization_id=%s and m.first_seen_at<=%s and m.first_seen_at>%s-interval '30 days'
  and m.source_category<>'development_fixture' and m.review_status not in ('false_positive','duplicate','closed')
  and (e.attributes->'shipmentIds' ? %s or e.attributes->>'shipmentId'=%s)""",(shipment,organization,now,now,str(shipment),str(shipment))).fetchone()
 features.update({'mention_count':mentions['n'],'strongest_match':mentions['strongest'],'assessment_confidence':mentions['confidence']})
 features['evidence_ids'].extend(mentions['ids'] or [])
 # Only licensed/public metrics available by the snapshot time. Null remains unknown.
 history=c.execute("""select distinct on(metric,location_code) id,metric,value from ophanim_public_history
  where location_code=any(%s) and available_at<=%s and observed_at<=%s and observed_at>%s-interval '7 days'
  order by metric,location_code,observed_at desc""",([s['origin_port_code'],s['destination_port_code']],now,now,now)).fetchall()
 allowed={'queue_hours','dwell_hours','wind_knots','wave_metres','rate_change','bunker_change','border_hours','truck_hours','incident_count','transit_change','weather_count'}
 for r in history:
  if r['metric'] in allowed and isinstance(r['value'],(int,float)):
   features[r['metric']]=max(features.get(r['metric'],r['value']),r['value']);features['evidence_ids'].append(str(r['id']))
 series=c.execute("""select metric,location_code,value from ophanim_public_history where metric in ('queue_hours','rate_change','transit_change')
  and location_code=any(%s) and available_at<=%s and observed_at<=%s and observed_at>%s-interval '90 days' order by observed_at""",([s['origin_port_code'],s['destination_port_code']],now,now,now)).fetchall()
 groups={}
 for row in series:
  if isinstance(row['value'],(int,float)):groups.setdefault((row['metric'],row['location_code']),[]).append(row['value'])
 changes=[regime_shift(v) for v in groups.values()];changes=[v for v in changes if v]
 for metric,feature in (('queue_hours','queue_forecast_hours'),('rate_change','rate_forecast_change'),('transit_change','transit_forecast_change')):
  predictions=[autoregressive_forecast(v) for (m,_),v in groups.items() if m==metric]
  predictions=[p for p in predictions if p is not None]
  if predictions:features[feature]=max(predictions)
 if changes:
  shifted=any(v['shifted'] for v in changes);features['regime']='shifted' if shifted else 'reference'
  features['regime_sentinel']={'shifted':shifted,'comparisons':changes}
 sid=c.execute('insert into ophanim_feature_snapshots(organization_id,shipment_id,as_of,feature_set_version,features) values(%s,%s,%s,%s,%s) returning id',(organization,shipment,now,VERSION,Jsonb(features))).fetchone()['id']
 return s,{'id':sid,'as_of':now,'features':features}

def training_rows(c,organization,reference=None):
 rows=c.execute("""select distinct on(s.id) s.id as shipment_id,f.as_of,f.features,s.planned_arrival_at as planned_at,s.actual_arrival_at as actual_at,
  (s.actual_arrival_at<=s.planned_arrival_at) as outcome,extract(epoch from s.actual_arrival_at-s.planned_arrival_at)/3600 as delay_hours
  from ophanim_shipments s join ophanim_feature_snapshots f on f.shipment_id=s.id and f.organization_id=s.organization_id
  where s.organization_id=%s and s.actual_arrival_at<now() and f.as_of<s.actual_arrival_at and f.as_of<s.planned_arrival_at
  and not s.historical and f.feature_set_version=%s and not exists(select 1 from ophanim_forecast_questions q join ophanim_forecast_outcomes o on o.question_id=q.id where q.shipment_id=s.id and q.organization_id=s.organization_id and o.intervention)
  order by s.id,f.as_of""",(organization,VERSION)).fetchall()
 out=[]
 for row in rows:
  # Label against the promise frozen at issuance, never a later revised ETA.
  planned=row['features'].get('planned_arrival_at')
  if not planned:continue
  original=datetime.fromisoformat(planned)
  if row['as_of']>=original:continue
  row['planned_at']=original;row['outcome']=row['actual_at']<=original
  row['delay_hours']=(row['actual_at']-original).total_seconds()/3600
  if reference and any(row['features'].get(k)!=reference.get(k) for k in ('lane','carrier','cargo_type','regime')):continue
  row.update({k:iso(row[k]) for k in ('as_of','planned_at','actual_at')});row['shipment_id']=str(row['shipment_id']);out.append(row)
 return sorted(out,key=lambda r:r['as_of'])

def reference_name(f):
 return VERSION+':arrives_by:'+hashlib.sha256(json.dumps({k:f.get(k) for k in ('lane','carrier','cargo_type','regime')},sort_keys=True).encode()).hexdigest()[:24]

def retrain(c,organization,features):
 rows=training_rows(c,organization,features)
 panel=fit(rows);name=reference_name(features)
 digest=hashlib.sha256(json.dumps(rows,sort_keys=True,default=iso).encode()).hexdigest()
 path=MODEL_ROOT/str(organization)/f'{name.replace(":","-")}-{digest}.joblib'
 sha=save(panel,path)
 active=c.execute("select * from ophanim_model_versions where organization_id=%s and model_name=%s and status='active' for update",(organization,name)).fetchone()
 metrics=dict(panel.metrics)
 # Replay the historical shock with only data that existed by its end. Never
 # evaluate February using an October-trained model and call it a backtest.
 shock_rows=[r for r in rows if r['as_of'][:10]<='2026-03-31']
 try:
  shock=fit(shock_rows).metrics
  metrics['shock_test_n']=shock['shock_test_n']
  metrics['shock_replay']={k:shock[k] for k in ('brier','base_rate_brier','carrier_eta_brier','beats_base_rate','beats_carrier_eta','shock_test_n')}
 except InsufficientHistory:metrics['shock_test_n']=0;metrics['shock_replay']={'status':'insufficient pre-shock frozen history'}
 if active:
  old=load_verified(active['artifact_uri'],active['artifact_sha256'],MODEL_ROOT)
  test=[r for r in rows[int(len(rows)*.8):] if datetime.fromisoformat(r['as_of'])>active['trained_at']]
  metrics['beats_active']=len(test)>=30 and scores([r['outcome'] for r in test],[panel.predict(r['features'])['probability'] for r in test])['brier']<scores([r['outcome'] for r in test],[old.predict(r['features'])['probability'] for r in test])['brier']
 else:metrics['beats_active']=True
 # Initial release also needs the requested Hormuz shock replay. No fixture can unlock it.
 metrics['activation_gate']=activation_gate(metrics)
 promote=metrics['activation_gate']['eligible']
 if promote and active:c.execute("update ophanim_model_versions set status='retired' where id=%s",(active['id'],))
 c.execute("""insert into ophanim_model_versions(organization_id,model_name,version,algorithm,feature_set_version,training_window,training_row_count,training_data_hash,artifact_uri,artifact_sha256,metrics,status)
  values(%s,%s,%s,'calibrated specialists + analog log-odds',%s,tstzrange(%s,%s,'[]'),%s,%s,%s,%s,%s,%s)""",
  (organization,name,digest[:16],VERSION,rows[0]['as_of'],rows[-1]['as_of'],len(rows),digest,str(path),sha,Jsonb(metrics),'active' if promote else 'candidate'))
 return metrics

def forecast(c,organization,shipment,trigger='operator_request'):
 c.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))',(str(shipment),))
 s,snap=snapshot(c,organization,shipment);f=snap['features']
 if not s['planned_arrival_at'] or s['planned_arrival_at']<=snap['as_of'] or s['actual_arrival_at']:
  return {'status':'withheld','reason':'A future planned arrival and unresolved shipment are required.'}
 threshold={'at':iso(s['planned_arrival_at'])}
 q=c.execute("""select * from ophanim_forecast_questions where organization_id=%s and shipment_id=%s and question_type='arrives_by' and threshold=%s and status='open' for update""",(organization,shipment,Jsonb(threshold))).fetchone()
 if not q:q=c.execute("""insert into ophanim_forecast_questions(organization_id,shipment_id,question_type,question_text,threshold,resolve_by)
  values(%s,%s,'arrives_by',%s,%s,%s) returning *""",(organization,shipment,f"Arrives by {iso(s['planned_arrival_at'])}?",Jsonb(threshold),s['planned_arrival_at'])).fetchone()
 rows=training_rows(c,organization,f)
 if len(rows)<30:return {'status':'withheld','question_id':str(q['id']),'reason':'No reference class with 30 resolved frozen shipments. Import history and accumulate prospective snapshots.','reference_n':len(rows)}
 active=c.execute("select * from ophanim_model_versions where organization_id=%s and model_name=%s and status='active'",(organization,reference_name(f))).fetchone()
 if not active:return {'status':'withheld','question_id':str(q['id']),'reason':'No active model has passed temporal, baseline, carrier and shock-replay gates.','reference_n':len(rows)}
 if not activation_gate(active['metrics'])['eligible']:
  return {'status':'withheld','question_id':str(q['id']),'reason':'Registered model does not satisfy current activation gates.','reference_n':len(rows)}
 model=load_verified(active['artifact_uri'],active['artifact_sha256'],MODEL_ROOT)
 prediction=model.predict(f,f.get('event_sequence'))
 if prediction['out_of_distribution']:return {'status':'withheld','reason':'Shipment is outside training distribution.','dissent':prediction['dissent']}
 previous=c.execute("select * from ophanim_forecasts where organization_id=%s and question_id=%s and source_type='ensemble' order by issued_at desc limit 1",(organization,q['id'])).fetchone()
 if previous and previous['issued_at']>snap['as_of']-timedelta(minutes=30):return {'status':'unchanged','question_id':str(q['id'])}
 common={'interval_method':prediction['interval_method'],'bayesian_updates':prediction['bayesian_updates'],'dissent':prediction['dissent'],'pre_mortem':prediction['pre_mortem'],'what_would_change_this':prediction['what_would_change_this'],'action':prediction['action'],'missing_features':prediction['missing_features'],'model_metrics':active['metrics']}
 issued=[]
 sources=[('ensemble',prediction['probability'],None),('base_rate',prediction['base_rate'],None),('carrier_eta',1.,None),('analog',prediction['analog_probability'],None)]
 sources += [('component_model',v['probability'],v['analyst']) for v in prediction['analysts']]
 for kind,p,analyst in sources:
  eta=[s['planned_arrival_at']+timedelta(hours=prediction[k]) for k in ('delay_p10_hours','delay_p50_hours','delay_p90_hours')] if kind=='ensemble' else [None]*3
  row=c.execute("""insert into ophanim_forecasts(organization_id,shipment_id,question_id,source_type,model_version_id,probability,p10_at,p50_at,p90_at,base_rate,drivers,analogs,rules_fired,feature_snapshot_id,trigger)
   values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",(organization,shipment,q['id'],kind,active['id'],p,*eta,prediction['base_rate'],Jsonb(prediction['drivers']),Jsonb(prediction['analogs']),Jsonb(prediction['rules_fired']),snap['id'],Jsonb({'cause':trigger,'analyst':analyst,'base_rate_reference':prediction['base_rate_reference'],'previous_forecast_id':str(previous['id']) if previous else None,**common}))).fetchone()
  issued.append(str(row['id']))
 return {'status':'issued','question_id':str(q['id']),'forecast_ids':issued}

def resolve_and_score(c):
 c.execute('select pg_advisory_xact_lock(732117)')
 # Absence of an actual timestamp is not a negative outcome. Overdue questions stay open.
 questions=c.execute("""select q.*,s.actual_arrival_at from ophanim_forecast_questions q join ophanim_shipments s
  on s.id=q.shipment_id and s.organization_id=q.organization_id where q.status='open' and q.question_type in ('arrives_by','eta_distribution','delay_over_days') and s.actual_arrival_at<=now() for update of q""").fetchall()
 customs=c.execute("""select q.*,fact.occurred_at as actual_arrival_at from ophanim_forecast_questions q
  join lateral(select occurred_at from ophanim_shipment_events where organization_id=q.organization_id and shipment_id=q.shipment_id
   and event_type='customs_release' and occurred_at<=now() order by occurred_at limit 1)fact on true
  where q.status='open' and q.question_type='clears_customs_by' for update of q""").fetchall()
 questions.extend(customs)
 for q in questions:
  if not q['threshold'].get('at'):continue
  target=datetime.fromisoformat(q['threshold']['at']);actual=q['actual_arrival_at']
  outcome=actual<=target
  if q['question_type']=='delay_over_days':outcome=actual>target+timedelta(days=float(q['threshold'].get('days',0)))
  c.execute("""insert into ophanim_forecast_outcomes(organization_id,question_id,outcome,actual_at,resolution_source,evidence)
   values(%s,%s,%s,%s,%s,%s) on conflict(question_id) do nothing""",(q['organization_id'],q['id'],outcome,actual,'shipment_event' if q['question_type']=='clears_customs_by' else 'actual_arrival',Jsonb({'shipment_id':str(q['shipment_id']),'actual_at':iso(actual)})))
  c.execute("update ophanim_forecast_questions set status='resolved' where id=%s and organization_id=%s",(q['id'],q['organization_id']))
 c.execute("""insert into ophanim_forecast_scores(organization_id,forecast_id,brier,log_loss,abs_error_hours,interval_hit)
  select f.organization_id,f.id,case when o.outcome is not null and f.probability is not null then power(f.probability-o.outcome::int,2) end,
  case when o.outcome is not null and f.probability is not null then -(o.outcome::int*ln(greatest(0.000001,f.probability))+(1-o.outcome::int)*ln(greatest(0.000001,1-f.probability))) end,
  abs(extract(epoch from o.actual_at-f.p50_at))/3600,case when f.p10_at is not null and o.actual_at is not null then o.actual_at between f.p10_at and f.p90_at end
  from ophanim_forecasts f join ophanim_forecast_outcomes o on o.question_id=f.question_id and o.organization_id=f.organization_id
  where not o.intervention on conflict(forecast_id) do nothing""")
 c.execute('delete from ophanim_forecast_score_rollups')
 c.execute("""insert into ophanim_forecast_score_rollups(organization_id,source_type,model_version_id,lane,question_type,month,analyst_key,n,mean_brier,mean_log_loss,calibration_bins,sharpness)
  select f.organization_id,f.source_type,f.model_version_id,coalesce(sn.features->>'lane','unknown'),q.question_type,date_trunc('month',f.issued_at)::date,
  coalesce(f.trigger->>'analyst',case when f.source_type='human' then f.user_id::text else 'aggregate' end),
  count(*)::int,avg(s.brier),avg(s.log_loss),'[]'::jsonb,stddev_pop(f.probability)
  from ophanim_forecasts f join ophanim_forecast_scores s on s.forecast_id=f.id and s.organization_id=f.organization_id
  join ophanim_forecast_questions q on q.id=f.question_id and q.organization_id=f.organization_id
  join ophanim_feature_snapshots sn on sn.id=f.feature_snapshot_id and sn.organization_id=f.organization_id
  group by f.organization_id,f.source_type,f.model_version_id,sn.features->>'lane',q.question_type,date_trunc('month',f.issued_at)::date,
  coalesce(f.trigger->>'analyst',case when f.source_type='human' then f.user_id::text else 'aggregate' end)""")
 c.execute("""with bins as (
  select f.organization_id,f.source_type,f.model_version_id,coalesce(sn.features->>'lane','unknown') as lane,q.question_type,date_trunc('month',f.issued_at)::date as month,
  coalesce(f.trigger->>'analyst',case when f.source_type='human' then f.user_id::text else 'aggregate' end) as analyst_key,
  least(9,floor(f.probability*10))::int as bin,count(*) as n,avg(f.probability) as predicted,avg(o.outcome::int) as observed
  from ophanim_forecasts f join ophanim_forecast_scores s on s.forecast_id=f.id and s.organization_id=f.organization_id
  join ophanim_forecast_outcomes o on o.question_id=f.question_id and o.organization_id=f.organization_id
  join ophanim_forecast_questions q on q.id=f.question_id and q.organization_id=f.organization_id
  join ophanim_feature_snapshots sn on sn.id=f.feature_snapshot_id and sn.organization_id=f.organization_id
  where f.probability is not null and o.outcome is not null and not o.intervention
  group by f.organization_id,f.source_type,f.model_version_id,sn.features->>'lane',q.question_type,date_trunc('month',f.issued_at)::date,
  coalesce(f.trigger->>'analyst',case when f.source_type='human' then f.user_id::text else 'aggregate' end),least(9,floor(f.probability*10))::int
 ) update ophanim_forecast_score_rollups r set calibration_bins=(select coalesce(jsonb_agg(jsonb_build_object('lower',b.bin/10.0,'n',b.n,'predicted',b.predicted,'observed',b.observed) order by b.bin),'[]')
  from bins b where b.organization_id=r.organization_id and b.source_type=r.source_type and b.model_version_id is not distinct from r.model_version_id
  and b.lane=r.lane and b.question_type=r.question_type and b.month=r.month and b.analyst_key=r.analyst_key)""")
 # Retire a deteriorating panel after thirty scored comparisons in a recent
 # window. Never silently keep serving an optimistic or worse-than-base model.
 c.execute("""with comparisons as (
  select f.model_version_id,count(*) as n,avg(es.brier) as ensemble_brier,avg(bs.brier) as baseline_brier,
   abs(avg(f.probability-o.outcome::int)) as bias
  from ophanim_forecasts f join ophanim_forecast_scores es on es.forecast_id=f.id and es.organization_id=f.organization_id
  join ophanim_forecast_outcomes o on o.question_id=f.question_id and o.organization_id=f.organization_id
  join ophanim_forecasts b on b.feature_snapshot_id=f.feature_snapshot_id and b.question_id=f.question_id and b.source_type='base_rate' and b.organization_id=f.organization_id
  join ophanim_forecast_scores bs on bs.forecast_id=b.id and bs.organization_id=b.organization_id
  where f.source_type='ensemble' and es.scored_at>now()-interval '90 days' and o.outcome is not null
  group by f.model_version_id having count(*)>=30
 ) update ophanim_model_versions m set status='retired',metrics=m.metrics||jsonb_build_object('drift_retired_at',now(),'recent_brier',d.ensemble_brier,'recent_bias',d.bias)
  from comparisons d where m.id=d.model_version_id and m.status='active' and (d.ensemble_brier>d.baseline_brier or d.bias>0.15)""")
 return {'resolved':len(questions)}

def jobs(retrain_models=False):
 with connect() as c:
  if not c.execute('select pg_try_advisory_xact_lock(732116) as ok').fetchone()['ok']:return {'status':'busy'}
  result=resolve_and_score(c)
  shipments=c.execute("select id,organization_id from ophanim_shipments where archived_at is null and current_status in ('planned','booked','in_transit','at_port')").fetchall()
  trained=set()
  for s in shipments:
   # Savepoints keep one unavailable tenant/model from stopping other jobs.
   try:
    with c.transaction():
     forecast(c,s['organization_id'],s['id'],'scheduled_corridor_refresh')
     if retrain_models:
      f=c.execute('select features from ophanim_feature_snapshots where organization_id=%s and shipment_id=%s order by as_of desc limit 1',(s['organization_id'],s['id'])).fetchone()['features']
      key=(s['organization_id'],reference_name(f))
      if key not in trained:
       try:
        with c.transaction():retrain(c,s['organization_id'],f)
       except InsufficientHistory:pass
       trained.add(key)
   except InsufficientHistory:pass
  return result

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass  # Never log tenant identifiers or request bodies.
 def reply(self,status,body):
  encoded=json.dumps(body,default=iso).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(encoded)));self.end_headers();self.wfile.write(encoded)
 def do_GET(self):
  self.reply(200,{'status':'ready','engine':VERSION}) if self.path=='/health' else self.reply(404,{'error':'Unknown endpoint'})
 def do_POST(self):
  secret=os.environ.get('FORECAST_WORKER_TOKEN','')
  if not secret or not hmac.compare_digest(self.headers.get('Authorization',''),f'Bearer {secret}'):return self.reply(401,{'error':'Unauthorized'})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if size<2 or size>4096:return self.reply(400,{'error':'Invalid body size'})
   body=json.loads(self.rfile.read(size))
   with connect() as c:
    if self.path=='/forecast':result=forecast(c,UUID(body['organization_id']),UUID(body['shipment_id']))
    elif self.path=='/resolve':result=resolve_and_score(c)
    else:return self.reply(404,{'error':'Unknown endpoint'})
   return self.reply(200,result)
  except (ValueError,KeyError):return self.reply(400,{'error':'Invalid worker request'})
  except Exception:return self.reply(503,{'error':'Forecast storage or model unavailable; no estimate issued.'})

def scheduler(stop):
 last_day=None
 while not stop.is_set():
  day=datetime.now(timezone.utc).date()
  try:jobs(retrain_models=day!=last_day);last_day=day
  except Exception:print('Forecast jobs unavailable; retry next interval.',flush=True)
  stop.wait(300)

if __name__=='__main__':
 if not os.environ.get('FORECAST_WORKER_TOKEN'):raise RuntimeError('FORECAST_WORKER_TOKEN required')
 stop=Event();Thread(target=scheduler,args=(stop,),daemon=True).start()
 ThreadingHTTPServer(('0.0.0.0',int(os.environ.get('PORT','8081'))),Handler).serve_forever()
