import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationAccessError } from '@/lib/operations/authorization';

const mocks = vi.hoisted(() => ({ search: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/providers', async () => {
  const { classifySearch } = await import('@/lib/providers/query-classifier');
  return { classifySearch, searchProviders: mocks.search };
});
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.auth }));
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: () => false, getClientIp: () => 'fixture-ip' }));
import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SHODAN_API_KEY', 'fixture');
  mocks.auth.mockResolvedValue({ organizationId: 'org-one', userId: 'user-one', role: 'analyst' });
  mocks.search.mockResolvedValue({ results: [], diagnostics: [] });
});
afterEach(() => vi.unstubAllEnvs());
describe('Global Shodan search credit guard', () => {
  it('cannot spend query credits on an unconfirmed autocomplete request', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=port%3A443'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'confirmation_required' });
    expect(mocks.search).not.toHaveBeenCalled(); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it('routes explicitly submitted searches through the registry with authenticated scope', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=shodan%3A%20nginx&confirm=true'));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'cyber:read');
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'shodan: nginx' }), expect.objectContaining({ organizationId: 'org-one' }));
  });
  it('rejects anonymous paid searches even with confirmation', async () => {
    mocks.auth.mockRejectedValueOnce(new OrganizationAccessError('Authentication is required.'));
    expect((await GET(new NextRequest('http://localhost/api/search?q=port%3A443&confirm=true'))).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('reports missing key configuration rather than returning misleading empty results', async () => {
    vi.stubEnv('SHODAN_API_KEY', '');
    const response = await GET(new NextRequest('http://localhost/api/search?q=port%3A443&confirm=true'));
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: 'missing_key' });
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('keeps public place-search autocomplete unchanged', async () => {
    expect((await GET(new NextRequest('http://localhost/api/search?q=Dubai'))).status).toBe(200);
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.search).toHaveBeenCalled();
  });
});
