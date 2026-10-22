export type PublicUpdate = { revision: string; checkedAt: string; updateMode: 'polling'; intervalSeconds: number; failedSources: number };
type Listener = (update: PublicUpdate) => void;

/** One polling loop per active server instance; no tenant data or provider credentials. */
export class PublicUpdateHub {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending: Promise<void> | undefined;
  private latest: PublicUpdate | undefined;
  constructor(private load: () => Promise<PublicUpdate>, private intervalMs = 300000, private capacity = 200) {}
  get subscribers() { return this.listeners.size; }
  subscribe(listener: Listener): (() => void) | null {
    if (this.listeners.size >= this.capacity) return null;
    this.listeners.add(listener);
    if (this.latest) { try { listener(this.latest); } catch { this.listeners.delete(listener); return () => {}; } }
    if (!this.timer) {
      this.timer = setInterval(() => { void this.refresh(); }, this.intervalMs);
      this.timer.unref?.(); void this.refresh();
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.timer) { clearInterval(this.timer); this.timer = undefined; }
    };
  }
  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.load().then(update => {
      const changed = this.latest?.revision !== update.revision;
      this.latest = update;
      if (changed) for (const listener of [...this.listeners]) { try { listener(update); } catch { /* Isolate disconnected clients. */ } }
    }).catch(() => {
      // An outage is not a new data observation. Heartbeats only describe transport.
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
}
