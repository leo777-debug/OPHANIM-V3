import unittest
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from analysts import LogNormalAFT, WeatherPortBayes, autoregressive_forecast, mine_precursors, is_subsequence


class SpecialistTests(unittest.TestCase):
    def test_aft_censoring_horizons_and_calibration(self):
        rng=np.random.default_rng(17)
        x=np.column_stack([rng.normal(size=150),np.full(150,24.)])
        durations=np.exp(3+.3*x[:,0]+rng.normal(0,.3,150))
        observed=durations<30
        aft=LogNormalAFT().fit_survival(x[:100],np.minimum(durations[:100],30),observed[:100])
        probabilities=aft.predict_proba([[0,12],[0,24],[0,48]])[:,1]
        self.assertTrue(np.all(np.diff(probabilities)>0))
        self.assertTrue(np.all((probabilities>0)&(probabilities<1)))
        calibrated=CalibratedClassifierCV(FrozenEstimator(aft),method='sigmoid').fit(x[100:],durations[100:]<=24)
        self.assertEqual(calibrated.predict_proba(x[:2]).shape,(2,2))
        with self.assertRaises(ValueError):LogNormalAFT().fit_survival(x[:10],durations[:10],observed[:10])

    def test_bayesian_chain_marginalizes_unobserved_queue(self):
        x=np.array([[0,0],[0,1],[1,1],[1,1]]*20)
        y=np.array([1,0,0,0]*20)
        model=WeatherPortBayes().fit(x,y)
        self.assertGreater(model.predict_proba([[0,0]])[0,1],model.predict_proba([[1,1]])[0,1])
        self.assertGreater(model.unobserved_queue_probability(False),model.unobserved_queue_probability(True))

    def test_regularized_time_series_refuses_short_or_invalid_history(self):
        self.assertIsNone(autoregressive_forecast([1]*12))
        self.assertIsNone(autoregressive_forecast([float('nan')]*40))
        self.assertAlmostEqual(autoregressive_forecast([7]*40),7)

    def test_ordered_patterns_have_distinct_shipment_support(self):
        rows=[{'outcome':False,'features':{'event_sequence':['advisory','queue','advisory','missed_gate']}} for _ in range(12)]
        rows += [{'outcome':True,'features':{'event_sequence':['gate','released']}} for _ in range(20)]
        rules=mine_precursors(rows)
        rule=next(r for r in rules if r['sequence']==['advisory','queue'])
        self.assertEqual(rule['n'],12)
        self.assertTrue(is_subsequence(rule['sequence'],['booked','advisory','other','queue']))
        self.assertFalse(is_subsequence(rule['sequence'],['queue','advisory']))


if __name__=='__main__':unittest.main()
