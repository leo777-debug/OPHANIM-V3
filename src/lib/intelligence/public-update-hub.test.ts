import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicUpdateHub, type PublicUpdate } from './public-update-hub';
const update = (revision: string): PublicUpdate => ({ revision, checkedAt: '2026-10-20T12:00:00Z', updateMode: 'polling', intervalSeconds: 300, failedSources: 0 });
afterEach(() => vi.useRealTimers());
describe('public polling fanout', () => {
  it('coalesces many subscribers, emits only changed revisions and cleans the last timer', async () => {
    vi.useFakeTimers(); let current = update('one');
    const load = vi.fn(async () => current), hub = new PublicUpdateHub(load, 300000, 1000);
    const listeners = Array.from({ length: 1000 }, () => vi.fn());
    const releases = listeners.map(listener => hub.subscribe(listener)!);
    await hub.refresh(); expect(load).toHaveBeenCalledTimes(1);
    expect(listeners.every(listener => listener.mock.calls.length === 1)).toBe(true);
    expect(hub.subscribe(vi.fn())).toBeNull();
    await hub.refresh(); expect(listeners[0]).toHaveBeenCalledTimes(1);
    current = update('two'); await vi.advanceTimersByTimeAsync(300000);
    expect(listeners.every(listener => listener.mock.calls.length === 2)).toBe(true);
    releases.forEach(release => release()); expect(hub.subscribers).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('isolates a failed listener and does not fabricate observations when polling fails', async () => {
    const load = vi.fn(async () => update('first')), good = vi.fn(), hub = new PublicUpdateHub(load);
    const releaseA = hub.subscribe(() => { throw new Error('Disconnected'); })!, releaseB = hub.subscribe(good)!;
    await hub.refresh(); expect(good).toHaveBeenCalledTimes(1);
    load.mockRejectedValueOnce(new Error('Upstream unavailable')); await hub.refresh();
    expect(good).toHaveBeenCalledTimes(1); releaseA(); releaseB();
  });
});
