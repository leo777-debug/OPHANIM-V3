import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());
describe('camera index route', () => {
  it('returns 400 for invalid input', async () => {
    expect((await GET(new Request('http://localhost/api/cctv/indexes?country=INVALID'))).status).toBe(400);
  });
  it('returns explicit 503 configuration state with no browser caching', async () => {
    vi.stubEnv('WINDY_WEBCAMS_API_KEY', '');
    const response = await GET(new Request('http://localhost/api/cctv/indexes?region=gcc'));
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ status: 'not_configured', cameras: [] });
  });
});
