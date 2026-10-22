export interface FeedObservation {
  checkedAt: string | null; lastSuccessAt: string | null; latencyMs: number | null;
  error: string | null; failures: number; circuitOpenUntil: string | null;
}
export interface FeedResult<T> {
  data: T | null;
  mode: 'fresh' | 'stale' | 'unavailable';
  staleSince: string | null;
  observation: FeedObservation;
}
type RecordEntry<T> = { value: T | null; validUntil: number; observation: FeedObservation };
type Config = { ttlMs: number; timeoutMs: number; retries: number; maxEntries: number; failureThreshold: number; cooldownMs: number };

/** Bounded, process-local last-good cache. Never labels cached failures as live. */
export class ResilientFeed<T> {
  private records = new Map<string, RecordEntry<T>>();
  private pending = new Map<string, Promise<FeedResult<T>>>();
  private config: Config;
  constructor(config: Partial<Config> = {}, private now = Date.now) {
    this.config = { ttlMs: 300000, timeoutMs: 8000, retries: 1, maxEntries: 100, failureThreshold: 3, cooldownMs: 300000, ...config };
    if (this.config.ttlMs < 0 || this.config.timeoutMs <= 0 || this.config.retries < 0 || this.config.retries > 3 || this.config.maxEntries < 1 || this.config.failureThreshold < 1 || this.config.cooldownMs <= 0) throw new Error('Invalid feed resilience configuration.');
  }
  clear() { this.records.clear(); this.pending.clear(); }
  async load(id: string, loader: (signal: AbortSignal) => Promise<T>): Promise<FeedResult<T>> {
    const pending = this.pending.get(id); if (pending) return pending;
    const current = this.records.get(id);
    if (current && (current.validUntil > this.now() || (current.observation.circuitOpenUntil && Date.parse(current.observation.circuitOpenUntil) > this.now()))) return this.result(current);
    const operation = this.refresh(id, loader).finally(() => { this.pending.delete(id); });
    this.pending.set(id, operation); return operation;
  }
  private result(record: RecordEntry<T>): FeedResult<T> {
    const mode = record.value === null ? 'unavailable' : record.observation.error || record.validUntil <= this.now() ? 'stale' : 'fresh';
    return { data: record.value, mode, staleSince: mode === 'stale' ? new Date(record.validUntil).toISOString() : null, observation: { ...record.observation } };
  }
  private async refresh(id: string, loader: (signal: AbortSignal) => Promise<T>): Promise<FeedResult<T>> {
    const previous = this.records.get(id), started = this.now();
    let value: T | null = previous?.value ?? null;
    let success = false;
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        value = await Promise.race([loader(controller.signal), new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, this.config.timeoutMs);
        })]);
        success = true; break;
      } catch (error) {
        // 4xx (including rate limiting) must wait for the normal refresh window.
        // Never retry an invalid request or defeat Retry-After restrictions.
        if (attempt >= this.config.retries || /\b4\d\d\b/.test(error instanceof Error ? error.message : '')) break;
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
      } finally { if (timeout) clearTimeout(timeout); }
    }
    const at = this.now(), failures = success ? 0 : (previous?.observation.failures ?? 0) + 1;
    const record: RecordEntry<T> = {
      value,
      // A failed source is retried no sooner than the normal polling interval.
      validUntil: success ? at + this.config.ttlMs : previous?.validUntil ?? at,
      observation: { checkedAt: new Date(at).toISOString(), lastSuccessAt: success ? new Date(at).toISOString() : previous?.observation.lastSuccessAt ?? null,
        latencyMs: Math.max(0, at - started), error: success ? null : 'Source fetch failed or timed out.', failures,
        circuitOpenUntil: !success ? new Date(at + (failures >= this.config.failureThreshold ? this.config.cooldownMs : this.config.ttlMs)).toISOString() : null },
    };
    if (!this.records.has(id) && this.records.size >= this.config.maxEntries) this.records.delete(this.records.keys().next().value!);
    this.records.set(id, record); return this.result(record);
  }
}

export function refreshLabel(mode: 'streaming' | 'polling' | 'reference' | 'replay', intervalSeconds?: number, sourceCadence?: string) {
  if (mode === 'streaming') return 'Streaming';
  if (mode === 'reference') return `Reference data${sourceCadence ? `; ${sourceCadence}` : ''}`;
  if (mode === 'replay') return 'Replay — recorded observations';
  if (!intervalSeconds || !Number.isFinite(intervalSeconds) || intervalSeconds < 1) return 'Periodic; interval not configured';
  const interval = intervalSeconds % 3600 === 0 ? `${intervalSeconds / 3600} h` : `${intervalSeconds} s`;
  return `Every ${interval}${sourceCadence ? ` (source updates ${sourceCadence})` : ''}`;
}
