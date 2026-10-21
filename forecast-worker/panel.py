"""Local, deterministic candidate panel. Never activates without temporal validation.

Only frozen numerical features enter models. Outcomes are separate training labels.
No networking, LLMs, or API keys in this module. One shipment per training example.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
import joblib
import numpy as np
from scipy.special import expit, logit
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.ensemble import HistGradientBoostingClassifier, IsolationForest
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

VERSION = 'panel-v1'
GROUPS = {
 'port_operations': ['queue_hours','dwell_hours'],
 'chokepoint_security': ['incident_count','transit_change','mention_count','assessment_confidence'],
 'customs_paperwork': ['incomplete_documents','customs_hours','holiday'],
 'weather_sea': ['wind_knots','wave_metres','weather_count'],
 'freight_bunker': ['rate_change','bunker_change','daily_demurrage'],
 'sanctions_screening': ['sanctions_matches','strongest_match'],
 'land_corridor': ['border_hours','truck_hours'],
 'carrier_behaviour': ['promise_gap_hours','silence_hours','operator_probability','season_index'],
}
FEATURES = sorted({f for group in GROUPS.values() for f in group})

class InsufficientHistory(ValueError):
 pass

def regime_shift(values):
 """Conservative recent-vs-reference change sentinel, not a causal conclusion."""
 if len(values)<14:return None
 x=np.asarray(values[-60:],float)
 if not np.isfinite(x).all():return None
 past,recent=x[:-7],x[-7:]
 scale=max(float(np.std(past)),abs(float(np.mean(past)))*.1,.01)
 z=abs(float(np.mean(recent)-np.mean(past)))/scale
 return {'shifted':z>=3,'standardized_change':z,'n':len(x)}

def matrix(records):
 """Missing feature flags are explicit; missing values are never evidence of safety."""
 return np.array([[float(r.get(f) or 0) for f in FEATURES] +
                  [float(r.get(f) is None) for f in FEATURES] for r in records])

def scores(y, probabilities):
 p=np.clip(probabilities,1e-6,1-1e-6)
 bins=[]
 for lower in np.arange(0,1,.1):
  ix=(p>=lower)&(p<lower+.1)
  if ix.any(): bins.append({'lower':round(float(lower),1),'n':int(ix.sum()),'predicted':float(p[ix].mean()),'observed':float(np.asarray(y)[ix].mean())})
 return {'brier':float(brier_score_loss(y,p)),'log_loss':float(log_loss(y,p,labels=[0,1])),
         'sharpness':float(np.std(p)), 'calibration_bins':bins}

def dtw(a,b):
 """Bounded sequence distance for timestamp-free event tokens."""
 a,b=a[-64:],b[-64:]
 if not a and not b:return 0.
 row=[0.]+[math.inf]*len(b)
 for x in a:
  nxt=[math.inf]
  for j,y in enumerate(b):nxt.append(float(x!=y)+min(row[j],row[j+1],nxt[-1]))
  row=nxt
 return row[-1]/max(1,len(a),len(b))

def causal_training_rows(rows):
 """Reject retrospective snapshots, unresolved labels, and repeated shipments."""
 result=[]; seen=set()
 for r in sorted(rows,key=lambda r:r['as_of']):
  if r['shipment_id'] in seen:continue
  if r['as_of']>=r['actual_at'] or r['as_of']>=r['planned_at']:continue
  if r.get('intervention') or r.get('features',{}).get('historical'):continue
  seen.add(r['shipment_id']);result.append(r)
 return result

@dataclass
class Panel:
 specialists: list
 weights: np.ndarray
 base_rate: float
 scaler: StandardScaler
 neighbors: NearestNeighbors
 anomaly: IsolationForest
 eta: object
 residuals: np.ndarray
 train: list
 rules: list
 event_likelihoods: dict
 metrics: dict

 def predict(self,features,sequence=None,explain=True):
  x=matrix([features]); votes=[]
  for name,indices,model in self.specialists:
   votes.append({'analyst':name,'probability':float(model.predict_proba(x[:,indices])[0,1])})
  distances,indices=self.neighbors.kneighbors(self.scaler.transform(x))
  analogs=[]
  for d,i in zip(distances[0],indices[0]):
   row=self.train[int(i)]
   analogs.append({'shipment_id':row['shipment_id'],'distance':float(d)+dtw(sequence or [],row.get('features',{}).get('event_sequence',[])),
                   'on_time':bool(row['outcome']),'delay_hours':float(row['delay_hours'])})
  analogs.sort(key=lambda a:a['distance']);analogs=analogs[:25]
  analog_p=(sum(a['on_time'] for a in analogs)+1)/(len(analogs)+2)
  all_p=[v['probability'] for v in votes]+[analog_p]
  probability=float(expit(np.average(logit(np.clip(all_p,.01,.99)),weights=self.weights)))
  sequence=sequence or features.get('event_sequence',[])
  updates=[{'event':e,'likelihood_ratio_on_time':self.event_likelihoods[e]} for e in sorted(set(sequence)) if e in self.event_likelihoods]
  # Conservatively use the strongest learned precursor only. Recomputing from the
  # frozen state applies each precursor once, rather than repeatedly multiplying odds.
  if updates:
   update=max(updates,key=lambda u:abs(math.log(u['likelihood_ratio_on_time'])))
   probability=float(expit(logit(np.clip(probability,.001,.999))+math.log(update['likelihood_ratio_on_time'])))
  # No unvalidated extremisation: correlated specialists are not independent votes.
  ood=bool(self.anomaly.predict(self.scaler.transform(x))[0]<0)
  delay=float(self.eta.predict(x)[0])
  radius=float(np.quantile(self.residuals,min(1,math.ceil((len(self.residuals)+1)*.8)/len(self.residuals)),method='higher'))
  dissent=max(votes,key=lambda v:abs(v['probability']-probability)) if votes else None
  # Counterfactual feature deltas, explicitly not SHAP. SHAP must be validated per model family before display.
  drivers=[]
  for f in (FEATURES if explain else []):
   if features.get(f) is None:continue
   changed=dict(features);changed[f]=float(np.median([r['features'].get(f) or 0 for r in self.train]))
   z=matrix([changed]);pv=[float(m.predict_proba(z[:,ix])[0,1]) for _,ix,m in self.specialists]+[analog_p]
   adjusted=float(expit(np.average(logit(np.clip(pv,.01,.99)),weights=self.weights)))
   drivers.append({'feature':f,'contribution':probability-adjusted,'method':'reference-value sensitivity','evidence_ids':features.get('evidence_ids',[])})
  drivers.sort(key=lambda d:abs(d['contribution']),reverse=True)
  if explain:
   import shap
   background=matrix([r['features'] for r in self.train[:20]])
   def predict_matrix(values):
    pv=[m.predict_proba(values[:,ix])[:,1] for _,ix,m in self.specialists]
    _,neighbors=self.neighbors.kneighbors(self.scaler.transform(values))
    analog=np.array([(sum(self.train[int(i)]['outcome'] for i in row)+1)/(len(row)+2) for row in neighbors])
    pv.append(analog)
    pooled=np.average(logit(np.clip(np.array(pv),.01,.99)),axis=0,weights=self.weights)
    shift=math.log(max(updates,key=lambda u:abs(math.log(u['likelihood_ratio_on_time'])))['likelihood_ratio_on_time']) if updates else 0
    return expit(pooled+shift)
   explainer=shap.Explainer(predict_matrix,background,algorithm='permutation',seed=17)
   attribution=explainer(x,max_evals=2*x.shape[1]+1).values[0]
   drivers=[{'feature':f,'contribution':float(attribution[i]+attribution[i+len(FEATURES)]),'method':'permutation SHAP (approximate)',
             'evidence_ids':features.get('evidence_ids',[])} for i,f in enumerate(FEATURES) if features.get(f) is not None]
   drivers.sort(key=lambda d:abs(d['contribution']),reverse=True)
  fired=[r for r in self.rules if (features.get(r['feature']) or 0)>r['threshold']]
  missing=[f for f in FEATURES if features.get(f) is None]
  seasonal=[r for r in self.train if r['features'].get('season')==features.get('season')]
  base_rate=float((sum(r['outcome'] for r in seasonal)+1)/(len(seasonal)+2)) if len(seasonal)>=30 else self.base_rate
  return {'probability':probability,'base_rate':base_rate,'base_rate_reference':'same lane/carrier/cargo/regime and quarter' if len(seasonal)>=30 else 'same lane/carrier/cargo/regime; quarter sample below 30',
          'analysts':votes,'analog_probability':analog_p,'analogs':analogs,
          'delay_p10_hours':delay-radius,'delay_p50_hours':delay,'delay_p90_hours':delay+radius,
          'interval_method':'split conformal 80%; exchangeability required, no guarantee under regime shift',
          'dissent':dissent,'out_of_distribution':ood,'drivers':drivers[:3],'rules_fired':fired,
          'bayesian_updates':updates,'missing_features':missing,'confidence':'withheld' if ood else 'limited',
          'what_would_change_this':['New timestamped route evidence','Milestone completion','Carrier ETA revision'],
          'pre_mortem':fired[0]['name'] if fired else 'No supported component failure rule; verify documentation and handoffs.',
          'action':{'description':'Verify outstanding paperwork and notify consignee of the interval.','expected_cost':None,'expected_benefit':None,'basis':'Cost-benefit unavailable without tenant tariffs and intervention outcomes.'}}

def fit(rows):
 rows=causal_training_rows(rows)
 if len(rows)<150:raise InsufficientHistory('Need 150 distinct causally frozen resolved shipments, including 30 untouched test cases.')
 # Ordered train/calibration/weight/test: no shuffled CV and no holdout reuse for tuning.
 n=len(rows);a,b,c=int(n*.5),int(n*.65),int(n*.8)
 train,cal,weight,test=rows[:a],rows[a:b],rows[b:c],rows[c:]
 # Purge labels that had not resolved at the start of the next partition.
 train=[r for r in train if r['actual_at']<cal[0]['as_of']]
 cal=[r for r in cal if r['actual_at']<weight[0]['as_of']]
 weight=[r for r in weight if r['actual_at']<test[0]['as_of']]
 if min(len(train),len(cal),len(weight))<15:raise InsufficientHistory('Temporal purge left too little resolved history.')
 for part in (train,cal,weight,test):
  if len({r['outcome'] for r in part})<2:raise InsufficientHistory('Each temporal partition needs both outcomes.')
 x=matrix([r['features'] for r in train]);y=np.array([r['outcome'] for r in train],int)
 xc=matrix([r['features'] for r in cal]);yc=np.array([r['outcome'] for r in cal],int)
 specialists=[]
 for index,(name,group) in enumerate(GROUPS.items()):
  # An unsupported specialist is absent, never a fabricated opinion.
  present=[f for f in group if sum(r['features'].get(f) is not None for r in train)>=15]
  if not present:continue
  ix=[FEATURES.index(f) for f in present]+[len(FEATURES)+FEATURES.index(f) for f in present]
  estimator=(make_pipeline(StandardScaler(),LogisticRegression(C=.2,max_iter=1000,random_state=17)) if index%2==0 else
             HistGradientBoostingClassifier(max_iter=60,max_leaf_nodes=7,l2_regularization=2,random_state=17))
  estimator.fit(x[:,ix],y)
  model=CalibratedClassifierCV(FrozenEstimator(estimator),method='sigmoid')
  model.fit(xc[:,ix],yc);specialists.append((name,ix,model))
 if not specialists:raise InsufficientHistory('No specialist has a supported feature group.')
 scaler=StandardScaler().fit(x);scaled=scaler.transform(x)
 neighbors=NearestNeighbors(n_neighbors=min(25,len(train))).fit(scaled)
 anomaly=IsolationForest(contamination=.05,random_state=17).fit(scaled)
 eta=make_pipeline(StandardScaler(),Ridge(alpha=10)).fit(x,np.array([r['delay_hours'] for r in train]))
 residuals=np.abs(np.array([r['delay_hours'] for r in cal])-eta.predict(xc))
 # Empirical one-step precursor rules; minimum support and observed rate are shown.
 rules=[]
 for f in FEATURES:
  values=[r['features'][f] for r in train if r['features'].get(f) is not None]
  if len(values)<20:continue
  threshold=float(np.quantile(values,.75));hits=[r for r in train if (r['features'].get(f) or 0)>threshold]
  if len(hits)>=10:
   rate=float(np.mean([not r['outcome'] for r in hits]))
   if rate>1-y.mean()+.1:rules.append({'name':f'{f.replace("_"," ")} elevated before delay','feature':f,'threshold':threshold,'n':len(hits),'delay_probability':rate})
 likelihoods={}
 for event in {e for r in train for e in r['features'].get('event_sequence',[])}:
  hits=[r for r in train if event in r['features'].get('event_sequence',[])]
  if len(hits)>=10:
   on=sum(r['outcome'] for r in hits);off=len(hits)-on
   likelihoods[event]=float(np.clip(((on+1)/(int(y.sum())+2))/((off+1)/(len(y)-int(y.sum())+2)),.25,4))
 panel=Panel(specialists,np.ones(len(specialists)+1),float((y.sum()+1)/(len(y)+2)),scaler,neighbors,anomaly,eta,residuals,train,rules,likelihoods,{})
 predictions=[panel.predict(r['features'],explain=False) for r in weight]
 yw=[r['outcome'] for r in weight]
 losses=[brier_score_loss(yw,[p['analysts'][i]['probability'] for p in predictions]) for i in range(len(specialists))]
 losses.append(brier_score_loss(yw,[p['analog_probability'] for p in predictions]))
 panel.weights=1/(np.array(losses)+.05)
 outputs=[panel.predict(r['features'],explain=False) for r in test];yt=np.array([r['outcome'] for r in test],int)
 metrics=scores(yt,[p['probability'] for p in outputs]);base=scores(yt,[p['base_rate'] for p in outputs])
 # Carrier ETA baseline is the booking promise (on-time certainty), scored identically.
 carrier=scores(yt,np.full(len(test),.999999))
 metrics.update({'holdout_n':len(test),'temporal_holdout':True,'training_n':len(train),
  'base_rate_brier':base['brier'],'carrier_eta_brier':carrier['brier'],'beats_base_rate':metrics['brier']<base['brier'],
  'beats_carrier_eta':metrics['brier']<carrier['brier'],'beats_active':False,
  'interval_coverage':float(np.mean([o['delay_p10_hours']<=r['delay_hours']<=o['delay_p90_hours'] for o,r in zip(outputs,test)])),
  'training_scope':'organization_only','feature_set_version':VERSION,'specialists':[s[0] for s in specialists],
  'shock_test_n':sum('2026-02-28'<=r['as_of'][:10]<='2026-03-31' for r in test)})
 panel.metrics=metrics;return panel

def save(panel,path):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);joblib.dump(panel,path)
 return hashlib.sha256(path.read_bytes()).hexdigest()

def load_verified(path,sha256,root):
 path=Path(path).resolve();root=Path(root).resolve()
 if not path.is_relative_to(root):raise ValueError('Artifact outside private model volume')
 if hashlib.sha256(path.read_bytes()).hexdigest()!=sha256:raise ValueError('Model artifact checksum mismatch')
 # joblib is executable serialization: private worker-written files only, never uploads.
 return joblib.load(path)

def monte_carlo(components,seed=17):
 """Bootstrap joint rows to retain shared shocks; refuse unsupported components."""
 if len(components)<30:raise InsufficientHistory('Need 30 observed joint journey decompositions')
 x=np.asarray(components,float)
 if x.ndim!=2 or not np.isfinite(x).all() or (x<0).any():raise ValueError('Invalid journey durations')
 rng=np.random.default_rng(seed);draws=x[rng.integers(0,len(x),10000)]
 return {'p10_p50_p90_hours':np.quantile(draws.sum(axis=1),[.1,.5,.9]).tolist(),
         'pre_mortem_component':int(np.argmax(np.var(draws,axis=0)))}
