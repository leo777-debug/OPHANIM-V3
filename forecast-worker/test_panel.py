import hashlib
import json
from datetime import datetime,timedelta,timezone
from pathlib import Path
import tempfile
import unittest
import numpy as np
from panel import fit,InsufficientHistory,causal_training_rows,dtw,monte_carlo,save,load_verified,scores,regime_shift,activation_gate

def history(n=200):
 rng=np.random.default_rng(17);out=[]
 for i in range(n):
  date=datetime(2023,1,1,tzinfo=timezone.utc)+timedelta(days=i*7)
  queue=float(rng.uniform(0,72));delay=queue-35+float(rng.normal(0,8))
  planned=date+timedelta(days=2);actual=planned+timedelta(hours=delay)
  out.append({'shipment_id':f'synthetic-{i}','as_of':date.isoformat(),'planned_at':planned.isoformat(),'actual_at':actual.isoformat(),
   'features':{'queue_hours':queue,'dwell_hours':queue*.8,'incident_count':float(rng.integers(0,5)),'lane':'TEST:TEST','event_sequence':['booked','documentation']},
   'outcome':delay<=0,'delay_hours':delay})
 return out

class PanelTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.rows=history();cls.model=fit(cls.rows)
 def test_no_history_no_forecast(self):
  with self.assertRaises(InsufficientHistory):fit([])
 def test_activation_refuses_unit_metrics_and_small_shock_samples(self):
  self.assertFalse(activation_gate(self.model.metrics)['eligible'])
  metrics=dict(self.model.metrics,beats_base_rate=True,beats_carrier_eta=True,beats_active=True,shock_test_n=1,shock_replay={'beats_base_rate':True,'beats_carrier_eta':True})
  self.assertFalse(activation_gate(metrics)['eligible'])
  metrics['shock_test_n']=30
  self.assertTrue(activation_gate(metrics)['eligible']) # Only tests gate arithmetic; never writes a model registry.
 def test_advanced_families_are_calibrated_and_compared_before_inclusion(self):
  rows=[dict(r,features={**r['features'],'forecast_horizon_hours':48,'wind_knots':r['features']['queue_hours']/2}) for r in self.rows]
  metrics=fit(rows).metrics
  self.assertIn('arrival_survival_aft',metrics['advanced_analyst_gates'])
  self.assertIn('weather_port_bayesian_association',metrics['advanced_analyst_gates'])
  for name,gate in metrics['advanced_analyst_gates'].items():
   self.assertEqual(name in metrics['specialists'],gate['included'])
   if gate['included']:self.assertLess(gate['weighting_brier'],gate['best_simple_brier'])
 def test_future_and_duplicate_snapshots_cannot_train(self):
  row=dict(self.rows[0]);bad=dict(row,as_of=row['actual_at'])
  self.assertEqual(len(causal_training_rows([bad])),0)
  self.assertEqual(len(causal_training_rows([row,row])),1)
 def test_cold_import_and_interventions_not_backfilled(self):
  row=dict(self.rows[0],features={'historical':True});self.assertEqual(causal_training_rows([row]),[])
  row=dict(self.rows[0],intervention=True);self.assertEqual(causal_training_rows([row]),[])
 def test_temporal_holdout_beats_naive_on_synthetic_signal_only(self):
  m=self.model.metrics
  self.assertTrue(m['temporal_holdout']);self.assertGreaterEqual(m['holdout_n'],30)
  self.assertTrue(m['beats_base_rate']);self.assertTrue(m['beats_carrier_eta'])
  self.assertFalse(m['beats_active']) # Unit fixtures never activate a registry model.
 def test_forecast_is_reproducible_and_interval_ordered(self):
  a=self.model.predict({'queue_hours':60,'dwell_hours':48},explain=False)
  b=self.model.predict({'queue_hours':60,'dwell_hours':48},explain=False)
  self.assertEqual(a,b);self.assertLess(a['delay_p10_hours'],a['delay_p90_hours'])
  self.assertGreater(len(a['missing_features']),0);self.assertLessEqual(len(a['analogs']),25)
 def test_artifact_hash_and_path_are_mandatory(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'model.joblib';sha=save(self.model,path)
   self.assertAlmostEqual(load_verified(path,sha,folder).base_rate,self.model.base_rate)
   with self.assertRaises(ValueError):load_verified(path,'0'*64,folder)
   with self.assertRaises(ValueError):load_verified(path,sha,Path(folder)/'other')
 def test_shap_explanation_runs_on_the_actual_panel(self):
  result=self.model.predict({'queue_hours':60,'dwell_hours':48,'incident_count':2})
  self.assertGreater(len(result['drivers']),0)
  self.assertTrue(all('SHAP' in d['method'] for d in result['drivers']))
 def test_joint_journeys_and_sequence_distance(self):
  result=monte_carlo([[10,1,2,3],[20,2,4,6]]*20)
  self.assertEqual(result,monte_carlo([[10,1,2,3],[20,2,4,6]]*20))
  self.assertEqual(dtw(['a','b'],['a','b']),0);self.assertGreater(dtw(['a'],['b']),0)
 def test_scoring_has_known_answers(self):
  result=scores([1,0],[.7,.3]);self.assertAlmostEqual(result['brier'],.09)
  self.assertAlmostEqual(result['log_loss'],-np.log(.7))
 def test_regime_sentinel_withholds_small_samples_and_detects_a_shift(self):
  self.assertIsNone(regime_shift([1,2,3]))
  self.assertFalse(regime_shift([10]*30)['shifted'])
  self.assertTrue(regime_shift([10]*23+[50]*7)['shifted'])

if __name__=='__main__':unittest.main()
