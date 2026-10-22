import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('maritime observation freshness', () => {
  it('preserves Digitraffic timestamps, drops stale/undated positions and expires failed-source caches', async () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-10-10T12:00:00Z');
    vi.setSystemTime(now);
    for (const key of ['AIS_API_KEY', 'CUSTOMER_AIS_API_URL', 'MARINETRAFFIC_AIS_API_URL']) vi.stubEnv(key, '');
    let offline = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (offline) throw new Error('offline');
      if (url.endsWith('/vessels')) return Response.json([]);
      return Response.json({ features: [now - 60_000, now - 2 * 86400_000, null].map((time, index) => ({
        geometry: { coordinates: [22, 60] }, properties: { mmsi: 230000000 + index, timestamp: 44, timestampExternal: time },
      })) });
    }));
    const { GET } = await import('./route');
    const body = await (await GET()).json();
    expect(body.ships).toHaveLength(1);
    expect(body.ships[0].observedAt).toBe(now - 60_000);
    expect(body.withheld_stale_or_undated).toBe(2);
    expect(body.ports.length).toBeGreaterThan(0);
    offline = true;
    vi.setSystemTime(now + 11 * 60_000);
    const expired = await (await GET()).json();
    expect(expired.ships).toEqual([]);
    expect(expired.ports.length).toBe(body.ports.length);
  });
});
