import { describe, expect, it } from 'vitest';
import { ProviderMetricsTracker } from './provider-metrics';

describe('ProviderMetricsTracker', () => {
  it('records attempts, retries, successes, and timeouts independently', () => {
    const metrics = new ProviderMetricsTracker();
    metrics.recordAttempt('test');
    metrics.recordAttempt('test', true);
    metrics.recordSuccess('test', 42);
    metrics.recordFailure('test', true);
    expect(metrics.get('test')).toMatchObject({ requests: 2, retries: 1, successes: 1, failures: 1, timeouts: 1, totalLatencyMs: 42, lastLatencyMs: 42 });
  });

  it('does not allow negative latency to reduce totals', () => {
    const metrics = new ProviderMetricsTracker();
    metrics.recordSuccess('test', -10);
    expect(metrics.get('test')).toMatchObject({ totalLatencyMs: 0, lastLatencyMs: 0 });
  });
});
