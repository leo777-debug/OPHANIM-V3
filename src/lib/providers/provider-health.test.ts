import { describe, expect, it } from 'vitest';
import { ProviderHealthTracker } from './provider-health';

describe('ProviderHealthTracker', () => {
  it('opens a short circuit after repeated failures and resets after success', () => {
    const tracker = new ProviderHealthTracker();
    tracker.recordFailure('example');
    tracker.recordFailure('example');
    expect(tracker.canExecute('example')).toBe(true);
    tracker.recordFailure('example');
    expect(tracker.get('example').status).toBe('circuit_open');
    expect(tracker.canExecute('example')).toBe(false);
    tracker.recordSuccess('example');
    expect(tracker.get('example')).toMatchObject({ status: 'healthy', consecutiveFailures: 0 });
  });
});
