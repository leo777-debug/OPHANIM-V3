import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: () => false, getClientIp: () => '192.0.2.1' }));
import { GET } from './route';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('reports missing Vercel enrichment configuration without trying a Docker hostname', async () => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('INTEL_URL', '');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const response = await GET(new Request('https://example.test/api/entity/expand?type=vessel&id=123456789'));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('not configured');
  expect(fetch).not.toHaveBeenCalled();
});
