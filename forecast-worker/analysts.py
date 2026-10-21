"""Local specialist families. Candidate status is separate from model validation.

No networks or credentials. Bayesian edges describe observational associations;
they do not estimate the effect of intervening on a port or shipment.
"""
from collections import Counter
from itertools import combinations
import math
import numpy as np
from scipy.optimize import minimize
from scipy.special import log_ndtr, ndtr
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler


class LogNormalAFT(ClassifierMixin, BaseEstimator):
    """Penalized lognormal accelerated-failure-time model with right censoring.

    The last input column is the question horizon in hours, never an outcome.
    Covariates exclude that column. fit_survival accepts observed durations and
    event flags; predict_proba answers P(duration <= question horizon).
    """
    def __init__(self, penalty=1.):
        self.penalty = penalty

    def fit(self, x, y):
        """sklearn compatibility; y has duration and observed-event columns."""
        y = np.asarray(y)
        return self.fit_survival(x, y[:, 0], y[:, 1])

    def fit_survival(self, x, duration_hours, observed):
        x = np.asarray(x, float)
        duration = np.asarray(duration_hours, float)
        observed = np.asarray(observed, bool)
        if len(x) < 30 or observed.sum() < 15:
            raise ValueError('AFT requires 30 durations and 15 observed events')
        if not np.isfinite(x).all() or not np.isfinite(duration).all() or (duration <= 0).any():
            raise ValueError('AFT requires finite features and positive durations')
        self.scaler_ = StandardScaler().fit(x[:, :-1])
        z = np.column_stack([np.ones(len(x)), self.scaler_.transform(x[:, :-1])])
        log_t = np.log(duration)

        def objective(theta):
            sigma = np.exp(theta[-1])
            residual = (log_t - z @ theta[:-1]) / sigma
            event_ll = -.5 * residual**2 - math.log(sigma) - log_t - .5 * math.log(2 * math.pi)
            censor_ll = log_ndtr(-residual)
            return -np.sum(np.where(observed, event_ll, censor_ll)) + self.penalty * np.sum(theta[1:-1]**2)

        initial = np.zeros(z.shape[1] + 1)
        initial[0] = float(np.median(log_t))
        initial[-1] = math.log(max(.1, float(np.std(log_t))))
        result = minimize(objective, initial, method='L-BFGS-B',
                          bounds=[(None, None)] * z.shape[1] + [(-4, 4)])
        if not result.success or not np.isfinite(result.fun):
            raise ValueError('AFT optimizer did not converge')
        self.coef_, self.sigma_ = result.x[:-1], float(np.exp(result.x[-1]))
        self.classes_, self.n_features_in_ = np.array([0, 1]), x.shape[1]
        return self

    def predict_proba(self, x):
        x = np.asarray(x, float)
        z = np.column_stack([np.ones(len(x)), self.scaler_.transform(x[:, :-1])])
        p = ndtr((np.log(np.maximum(x[:, -1], 1e-6)) - z @ self.coef_) / self.sigma_)
        return np.column_stack([1-p, p])

    def predict(self, x):
        return (self.predict_proba(x)[:, 1] >= .5).astype(int)


class WeatherPortBayes(ClassifierMixin, BaseEstimator):
    """Smoothed discrete weather -> queue -> arrives-by network.

    Both the weather and queue node are required. Missing observations are not
    a calm-weather/empty-queue state. With the queue observed, the chain obeys
    conditional independence: P(arrives|weather,queue)=P(arrives|queue).
    """
    def fit(self, x, y):
        x, y = np.asarray(x, float), np.asarray(y, int)
        self.thresholds_ = np.median(x, axis=0)
        self.thresholds_ = np.where(self.thresholds_ >= x.max(axis=0), (x.min(axis=0)+x.max(axis=0))/2, self.thresholds_)
        states = x > self.thresholds_
        self.weather_p_ = (states[:, 0].sum()+1)/(len(x)+2)
        self.queue_p_ = np.array([(states[states[:, 0] == w, 1].sum()+1)/((states[:, 0] == w).sum()+2) for w in (0, 1)])
        self.on_time_p_ = np.array([(y[states[:, 1] == q].sum()+1)/((states[:, 1] == q).sum()+2) for q in (0, 1)])
        self.classes_, self.n_features_in_ = np.array([0, 1]), x.shape[1]
        return self

    def predict_proba(self, x):
        states = np.asarray(x, float) > self.thresholds_
        p = self.on_time_p_[states[:, 1].astype(int)]
        return np.column_stack([1-p, p])

    def unobserved_queue_probability(self, weather_elevated):
        queue_p = self.queue_p_[int(weather_elevated)]
        return float((1-queue_p)*self.on_time_p_[0] + queue_p*self.on_time_p_[1])

    def predict(self, x):
        return (self.predict_proba(x)[:, 1] >= .5).astype(int)


def autoregressive_forecast(values, lag=7):
    """Regularized one-step local AR forecast, fitted only to supplied past data."""
    values = np.asarray(values, float)
    if len(values) < max(30, lag*3) or not np.isfinite(values).all():
        return None
    # The caller must pass one metric/location in observation order.
    values = values[-180:]
    x = np.array([values[i-lag:i] for i in range(lag, len(values))])
    y = values[lag:]
    scale = StandardScaler().fit(x)
    model = Ridge(alpha=10).fit(scale.transform(x), y)
    return float(model.predict(scale.transform([values[-lag:]]))[0])


def is_subsequence(pattern, sequence):
    iterator = iter(sequence)
    return all(any(token == candidate for candidate in iterator) for token in pattern)


def mine_precursors(rows, minimum_support=10, max_length=3, minimum_lift=.1):
    """Bounded ordered subsequence mining, one support vote per shipment.

    At most 12 most recent tokens and length 3; outcome support is measured only
    in the training partition. No unrestricted exponential search at runtime.
    """
    support, delayed = Counter(), Counter()
    baseline = sum(not r['outcome'] for r in rows)/max(1, len(rows))
    for row in rows:
        sequence = [str(t)[:80] for t in row['features'].get('event_sequence', [])[-12:]]
        patterns = {tuple(p) for length in range(2, max_length+1) for p in combinations(sequence, length)}
        for pattern in patterns:
            support[pattern] += 1
            delayed[pattern] += int(not row['outcome'])
    rules = []
    for pattern, n in support.items():
        rate = delayed[pattern]/n
        if n >= minimum_support and rate >= baseline + minimum_lift:
            rules.append({'name': ' → '.join(pattern) + ' preceded delay', 'sequence': list(pattern),
                          'n': n, 'delay_probability': rate, 'lift': rate-baseline,
                          'method': 'ordered subsequence; training support only'})
    return sorted(rules, key=lambda r: (-r['lift'], -r['n'], r['name']))[:50]
