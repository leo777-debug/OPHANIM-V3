import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResilientFeed, refreshLabel } from './resilient-feed';
afterEach(() => vi.useRealTimers());
describe('last-good feed resilience', () => {
  it('coalesces browsers and preserves actual checked time inside the polling interval', async () => {
    let now = 1000;
    const cache = new ResilientFeed<number[]>({ ttlMs: 1000 }, () => now);
    const loader = vi.fn(async () => [1, 2]);
    const values = await Promise.all(Array.from({ length: 100 }, () => cache.load('source', loader)));
    expect(loader).toHaveBeenCalledTimes(1);
    expect(values[0]).toMatchObject({ data: [1, 2], mode: 'fresh', observation: { lastSuccessAt: '1970-01-01T00:00:01.000Z' } });
    now = 1500; expect((await cache.load('source', loader)).observation.checkedAt).toBe(values[0].observation.checkedAt);
  });
  it('labels cached values stale and backs off after failures without moving last success', async () => {
    let now = 1000;
    const cache = new ResilientFeed<number[]>({ ttlMs: 100, retries: 0, failureThreshold: 2, cooldownMs: 1000 }, () => now);
    const loader = vi.fn().mockResolvedValue([1]); await cache.load('source', loader);
    now = 1200; loader.mockRejectedValue(new Error('secret error'));
    const stale = await cache.load('source', loader);
    expect(stale).toMatchObject({ data: [1], mode: 'stale', staleSince: '1970-01-01T00:00:01.100Z', observation: { lastSuccessAt: '1970-01-01T00:00:01.000Z', failures: 1 } });
    expect(JSON.stringify(stale)).not.toContain('secret error');
    now = 1250; await cache.load('source', loader); expect(loader).toHaveBeenCalledTimes(2);
    now = 1350; await cache.load('source', loader); expect(loader).toHaveBeenCalledTimes(3);
    now = 2000; await cache.load('source', loader); expect(loader).toHaveBeenCalledTimes(3);
    now = 2500; loader.mockResolvedValue([2]); expect((await cache.load('source', loader)).mode).toBe('fresh');
  });
  it('bounds memory, does not retry 429, and does not invent a last success', async () => {
    const cache = new ResilientFeed<number>({ maxEntries: 1, retries: 1 });
    const loader = vi.fn().mockRejectedValue(new Error('HTTP 429'));
    const value = await cache.load('a', loader);
    expect(value.mode).toBe('unavailable'); expect(value.observation.lastSuccessAt).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.load('b', loader); await cache.load('a', loader); expect(loader).toHaveBeenCalledTimes(3);
  });
  it('times out stalled loaders and retries transient errors with backoff', async () => {
    vi.useFakeTimers();
    const cache = new ResilientFeed<number>({ timeoutMs: 100, retries: 1 });
    const loader = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(7);
    const result = cache.load('a', loader); await vi.advanceTimersByTimeAsync(400);
    expect((await result).data).toBe(7); expect(loader).toHaveBeenCalledTimes(2);
  });
  it('labels periodic, reference and replay sources honestly', () => {
    expect(refreshLabel('polling', 60)).toBe('Every 60 s');
    expect(refreshLabel('polling', 21600, 'daily')).toBe('Every 6 h (source updates daily)');
    expect(refreshLabel('reference')).toContain('Reference data');
    expect(refreshLabel('replay')).toContain('Replay');
    expect(refreshLabel('polling')).not.toContain('Streaming');
  });
});
