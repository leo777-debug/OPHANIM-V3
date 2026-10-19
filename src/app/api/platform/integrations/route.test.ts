import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationAccessError } from '@/lib/operations/authorization';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limited: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.auth }));
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: mocks.limited }));
import { GET, POST } from './route';

const request = (body: unknown, origin?: string) => new NextRequest('https://ophanim.example/api/platform/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ organizationId: 'org' }); mocks.limited.mockReturnValue(false); });
describe('protected integrations API', () => {
  it('rejects signed-out and non-admin access for list and tests', async () => {
    mocks.auth.mockRejectedValue(new OrganizationAccessError());
    expect((await GET(new NextRequest('https://ophanim.example/api/platform/integrations'))).status).toBe(403);
    expect((await POST(request({ id: 'usgs' }))).status).toBe(403);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'organization:manage');
  });
  it('does not cache admin metadata or expose environment values', async () => {
    const response = await GET(new NextRequest('https://ophanim.example/api/platform/integrations'));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.integrations.length).toBeGreaterThan(40);
    expect(body.integrations[0]).not.toHaveProperty('apiKey');
  });
  it('rejects user-supplied URLs, secrets, cross-origin requests and excessive tests', async () => {
    expect((await POST(request({ id: 'usgs', url: 'http://localhost' }))).status).toBe(400);
    expect((await POST(request({ id: 'usgs', key: 'secret' }))).status).toBe(400);
    expect((await POST(request({ id: 'usgs' }, 'https://other.example'))).status).toBe(403);
    mocks.limited.mockReturnValue(true);
    expect((await POST(request({ id: 'usgs' }))).status).toBe(429);
  });
});
