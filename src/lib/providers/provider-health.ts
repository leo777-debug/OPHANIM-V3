export type ProviderHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'circuit_open';

export interface ProviderHealthRecord {
  provider: string;
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  circuitOpenUntil?: string;
}

const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 5 * 60_000;

export class ProviderHealthTracker {
  private readonly records = new Map<string, ProviderHealthRecord>();

  get(provider: string): ProviderHealthRecord {
    const record = this.records.get(provider);
    if (!record) return { provider, status: 'unknown', consecutiveFailures: 0 };
    if (record.status === 'circuit_open' && record.circuitOpenUntil && Date.parse(record.circuitOpenUntil) <= Date.now()) {
      const recovered = { ...record, status: 'degraded' as const, circuitOpenUntil: undefined };
      this.records.set(provider, recovered);
      return recovered;
    }
    return record;
  }

  canExecute(provider: string): boolean {
    return this.get(provider).status !== 'circuit_open';
  }

  recordSuccess(provider: string): ProviderHealthRecord {
    const record: ProviderHealthRecord = {
      provider,
      status: 'healthy',
      consecutiveFailures: 0,
      lastSuccessAt: new Date().toISOString(),
    };
    this.records.set(provider, record);
    return record;
  }

  recordFailure(provider: string): ProviderHealthRecord {
    const current = this.get(provider);
    const consecutiveFailures = current.consecutiveFailures + 1;
    const circuitOpen = consecutiveFailures >= FAILURE_THRESHOLD;
    const record: ProviderHealthRecord = {
      ...current,
      provider,
      status: circuitOpen ? 'circuit_open' : 'degraded',
      consecutiveFailures,
      lastFailureAt: new Date().toISOString(),
      ...(circuitOpen ? { circuitOpenUntil: new Date(Date.now() + CIRCUIT_COOLDOWN_MS).toISOString() } : {}),
    };
    this.records.set(provider, record);
    return record;
  }
}

export const providerHealth = new ProviderHealthTracker();
