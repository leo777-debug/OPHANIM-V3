// Real HTTP → Python → PostgreSQL-wire → migrated database integration.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {startTestDatabase} from '../presentation/test-db.mjs';
const db=await startTestDatabase(55461),token=randomBytes(32).toString('hex');
const python=process.env.FORECAST_TEST_PYTHON??(process.platform==='win32'?'.venv-forecast/Scripts/python.exe':'python3');
const worker=spawn(python,['forecast-worker/service.py'],{env:{...process.env,DATABASE_URL:db.url,FORECAST_WORKER_TOKEN:token,PORT:'18081',MODEL_ROOT:'.forecast-test-models'},stdio:['ignore','pipe','pipe'],windowsHide:true});
let stderr='';worker.stderr.on('data',b=>stderr+=b.toString());
const base='http://127.0.0.1:18081';
try{
 for(let i=0;i<90;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));if(i===89)throw new Error('Worker startup failed: '+stderr);}
 const org='10000000-0000-4000-8000-000000000001',shipment='51000000-0000-4000-8000-000000000001';
 await db.db.query("insert into ophanim_shipments(id,organization_id,shipment_reference,origin_port_code,destination_port_code,planned_arrival_at) values($1,$2,'WORKER TEST ONLY','AEJEA','AEFJR',now()+interval '2 days')",[shipment,org]);
 const request=async(path,body,auth=token)=>fetch(base+path,{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await request('/forecast',{organization_id:org,shipment_id:shipment},'wrong')).status,401);
 let response=await request('/forecast',{organization_id:org,shipment_id:shipment});
 assert.equal(response.status,200);assert.equal((await response.json()).status,'withheld');
 assert.equal((await db.db.query('select count(*)::int as n from ophanim_feature_snapshots')).rows[0].n,1);
 response=await request('/forecast',{organization_id:'20000000-0000-4000-8000-000000000002',shipment_id:shipment});
 assert.equal(response.status,400);
 const snap=(await db.db.query('select id from ophanim_feature_snapshots where organization_id=$1',[org])).rows[0].id;
 const q=(await db.db.query('select id from ophanim_forecast_questions where organization_id=$1 and shipment_id=$2',[org,shipment])).rows[0].id;
 await db.db.query("insert into ophanim_forecasts(organization_id,shipment_id,question_id,source_type,probability,feature_snapshot_id,trigger) values($1,$2,$3,'base_rate',.7,$4,'{}')",[org,shipment,q,snap]);
 await db.db.query('update ophanim_shipments set actual_arrival_at=now() where id=$1',[shipment]);
 response=await request('/resolve',{});assert.equal(response.status,200);assert.equal((await response.json()).resolved,1);
 const scored=(await db.db.query('select brier,log_loss from ophanim_forecast_scores')).rows[0];
 assert.ok(Math.abs(scored.brier-.09)<1e-8);assert.ok(Math.abs(scored.log_loss+Math.log(.7))<1e-8);
 assert.equal((await request('/resolve',{})).status,200);assert.equal((await db.db.query('select count(*)::int as n from ophanim_forecast_scores')).rows[0].n,1);
 // The merged job-file and analyst ports share the same scoring cycle. Public
 // questions have no shipment; rule forecasts and acted-on warnings must coexist.
 const user='20000000-0000-4000-8000-000000000001';
 for(const [type,source,intervention] of [['public_question','human',false],['paper_risk','rule',false],['paper_risk','rule',true]]){
  const publicQuestion=type==='public_question';
  const snapshot=(await db.db.query("insert into ophanim_feature_snapshots(organization_id,shipment_id,feature_set_version,features) values($1,$2,'integration-test',$3) returning id",[org,publicQuestion?null:shipment,JSON.stringify(publicQuestion?{scope:'public_question'}:{lane:'TEST ONLY'})])).rows[0].id;
  const question=(await db.db.query("insert into ophanim_forecast_questions(organization_id,shipment_id,question_type,question_text,threshold,resolve_by) values($1,$2,$3,'SYNTHETIC compatibility question',$4,now()+interval '1 hour') returning id",[org,publicQuestion?null:shipment,type,JSON.stringify(publicQuestion?{scope:'public_question'}:{subjectKey:'test'})])).rows[0].id;
  const forecast=(await db.db.query("insert into ophanim_forecasts(organization_id,shipment_id,question_id,source_type,user_id,probability,feature_snapshot_id,trigger) values($1,$2,$3,$4,$5,.8,$6,'{}') returning id",[org,publicQuestion?null:shipment,question,source,source==='human'?user:null,snapshot])).rows[0].id;
  await db.db.query("insert into ophanim_forecast_outcomes(organization_id,question_id,outcome,resolution_source,reviewer_user_id,evidence,intervention) values($1,$2,true,'manual',$3,'{}',$4)",[org,question,user,intervention]);
  await db.db.query("update ophanim_forecast_questions set status='resolved' where id=$1",[question]);
  assert.equal((await request('/resolve',{})).status,200);
  const scores=(await db.db.query('select brier from ophanim_forecast_scores where forecast_id=$1',[forecast])).rows;
  if(intervention)assert.equal(scores.length,0);else assert.ok(Math.abs(scores[0].brier-.04)<1e-8);
 }
 const rollups=(await db.db.query('select source_type from ophanim_forecast_score_rollups')).rows.map(r=>r.source_type);
 assert.ok(rollups.includes('human')&&rollups.includes('rule')&&rollups.includes('base_rate'));
 console.log('PASS: worker auth, tenant parent rejection, honest cold start, snapshot persistence, actual resolution, Brier/log loss, idempotent scoring, analyst null-shipment questions, job-file rules and intervention exclusion on one ledger.');
}finally{worker.kill();await new Promise(r=>worker.once('exit',r));await db.stop();}
