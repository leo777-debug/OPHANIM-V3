export interface ProviderMetricRecord {
  provider: string;
  requests: number;
  successes: number;
  failures: number;
  timeouts: number;
  retries: number;
  totalLatencyMs: number;
  lastLatencyMs?: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
}

function empty(provider: string): ProviderMetricRecord {
  return { provider, requests: 0, successes: 0, failures: 0, timeouts: 0, retries: 0, totalLatencyMs: 0 };
}

export class ProviderMetricsTracker {
  private readonly records = new Map<string, ProviderMetricRecord>();

  get(provider: string): ProviderMetricRecord {
    return this.records.get(provider) ?? empty(provider);
  }

  recordAttempt(provider: string, retry = false): void {
    const current = this.get(provider);
    this.records.set(provider, { ...current, requests: current.requests + 1, retries: current.retries + (retry ? 1 : 0) });
  }

  recordSuccess(provider: string, latencyMs: number): void {
    const current = this.get(provider);
    this.records.set(provider, {
      ...current,
      successes: current.successes + 1,
      totalLatencyMs: current.totalLatencyMs + Math.max(0, latencyMs),
      lastLatencyMs: Math.max(0, latencyMs),
      lastSuccessAt: new Date().toISOString(),
    });
  }

  recordFailure(provider: string, timeout = false): void {
    const current = this.get(provider);
    this.records.set(provider, {
      ...current,
      failures: current.failures + 1,
      timeouts: current.timeouts + (timeout ? 1 : 0),
      lastFailureAt: new Date().toISOString(),
    });
  }
}

export const providerMetrics = new ProviderMetricsTracker();
