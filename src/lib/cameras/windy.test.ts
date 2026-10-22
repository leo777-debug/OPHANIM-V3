import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cameraRegionsAt, GCC_COUNTRIES } from './regions';

const fixture = {
  webcamId: 123, status: 'active', title: 'Published promenade',
  lastUpdatedOn: '2026-10-22T08:00:00Z',
  location: { latitude: 25.2, longitude: 55.3, city: 'Dubai', country: 'United Arab Emirates', country_code: 'AE' },
  player: { live: 'https://webcams.windy.com/webcams/public/embed/player/123/live' },
  urls: { detail: 'https://www.windy.com/webcams/123' },
};

beforeEach(() => { vi.resetModules(); vi.stubEnv('WINDY_WEBCAMS_API_KEY', 'fixture-secret'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('public webcam discovery', () => {
  it('keeps valid location, live playback and provider timestamp', async () => {
    const { normalizeWindyCamera } = await import('./windy');
    expect(normalizeWindyCamera(fixture)).toMatchObject({ id: 'windy-123', lat: 25.2, country_code: 'AE', media_kind: 'live', stream_type: 'iframe', observation_time: fixture.lastUpdatedOn });
  });
  it('rejects inactive cameras and invalid coordinates, including non-finite values', async () => {
    const { normalizeWindyCamera } = await import('./windy');
    expect(normalizeWindyCamera({ ...fixture, status: 'inactive' })).toBeNull();
    for (const latitude of [NaN, Infinity, 91, null]) expect(normalizeWindyCamera({ ...fixture, location: { ...fixture.location, latitude } })).toBeNull();
  });
  it('does not call timelapse live or embed arbitrary streams', async () => {
    const { normalizeWindyCamera } = await import('./windy');
    for (const live of ['http://192.168.1.1/', 'https://windy.com.evil.example/', 'javascript:alert(1)']) {
      expect(normalizeWindyCamera({ ...fixture, player: { live, day: fixture.player.live } })).toMatchObject({ media_kind: 'publisher_page' });
      expect(normalizeWindyCamera({ ...fixture, player: { live } })?.stream_url).toBeUndefined();
    }
  });
  it('validates parameters and accepts zero-coordinate viewport searches', async () => {
    const { parseCameraIndexQuery } = await import('./windy');
    expect(parseCameraIndexQuery(new URLSearchParams('region=gcc&country=ae&offset=50'))).toMatchObject({ country: 'AE', offset: 50 });
    expect(parseCameraIndexQuery(new URLSearchParams('lat=0&lng=0&radius=100')).nearby).toEqual([0, 0, 100]);
    for (const query of ['region=__proto__', 'region=gcc&country=US', 'offset=-1', 'offset=10001', 'country=USA', 'lat=0&lng=0', 'lat=&lng=0&radius=1', 'lat=91&lng=0&radius=1', 'lat=0&lng=0&radius=251']) expect(() => parseCameraIndexQuery(new URLSearchParams(query))).toThrow();
  });
  it('distinguishes missing configuration without requesting upstream', async () => {
    vi.stubEnv('WINDY_WEBCAMS_API_KEY', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { searchCameraIndex } = await import('./windy');
    expect(await searchCameraIndex({ region: 'gcc', offset: 0 })).toMatchObject({ status: 'not_configured', cameras: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses header auth, correct region filters and pagination; deduplicates requests', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ webcams: [fixture], total: 123 }));
    vi.stubGlobal('fetch', fetcher);
    const { searchCameraIndex } = await import('./windy');
    const query = { region: 'gcc' as const, country: 'AE', offset: 50 };
    const [first, second] = await Promise.all([searchCameraIndex(query), searchCameraIndex(query)]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ status: 'ok', total: 123, nextOffset: 100 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('countries')).toBe('AE');
    expect(url.searchParams.get('offset')).toBe('50');
    expect(url.href).not.toContain('fixture-secret');
    expect(fetcher.mock.calls[0][1].headers).toEqual({ 'x-windy-api-key': 'fixture-secret' });
    expect(JSON.stringify(first)).not.toContain('fixture-secret');
    await searchCameraIndex(query);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reports partial MENA groups and retries instead of caching missing countries', async () => {
    let calls = 0;
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      calls++;
      const countries = new URL(url).searchParams.get('countries')!.split(',');
      expect(countries.length).toBeLessThanOrEqual(10);
      return calls === 2 ? new Response('', { status: 503 }) : Response.json({ webcams: [fixture], total: 1 });
    });
    vi.stubGlobal('fetch', fetcher);
    const { searchCameraIndex } = await import('./windy');
    const first = await searchCameraIndex({ region: 'mena', offset: 0 });
    expect(first.status).toBe('partial');
    expect(first.cameras).toHaveLength(1);
    expect((await searchCameraIndex({ region: 'mena', offset: 0 })).status).toBe('ok');
    expect(calls).toBe(6);
  });
  it('reports a provider rejection as unavailable, with no leaked upstream body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('fixture-secret', { status: 401 })));
    const { searchCameraIndex } = await import('./windy');
    const result = await searchCameraIndex({ region: 'gcc', offset: 0 });
    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });
  it('samples all seven continents and explicitly queries every GCC country', async () => {
    const urls: URL[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => { urls.push(new URL(url)); return Response.json({ webcams: [fixture], total: 1 }); }));
    const { globalCameraOverview } = await import('./windy');
    expect((await globalCameraOverview()).cameras).toHaveLength(1);
    for (const country of GCC_COUNTRIES) expect(urls.some(url => url.searchParams.get('countries') === country)).toBe(true);
    expect(new Set(urls.map(url => url.searchParams.get('continents')).filter(Boolean)).size).toBe(7);
  });
  it.each([[25.2, 55.3], [24.7, 46.7], [25.3, 51.5], [29.4, 47.9], [26.2, 50.6], [23.6, 58.4]])('routes Gulf viewport %s,%s to GCC', (lat, lng) => {
    expect(cameraRegionsAt(lat, lng, 1)).toContain('gcc');
  });
  it('covers North Africa rather than returning UK/US fallback regions', () => {
    expect(cameraRegionsAt(33.6, -7.6, 1)).toContain('north-africa');
    expect(cameraRegionsAt(-33.9, 18.4, 1)).toEqual([]);
  });
});
