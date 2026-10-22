import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { OrganizationAccessError } from '@/lib/operations/authorization';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), inspect: vi.fn(), limited: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.actor }));
vi.mock('@/lib/ssrf-guard', async original => ({ ...await original<typeof import('@/lib/ssrf-guard')>(), isRateLimited: mocks.limited }));
vi.mock('@/lib/integrations/scanner', async original => ({ ...await original<typeof import('@/lib/integrations/scanner')>(), inspectApprovedTarget: mocks.inspect }));
import { GET, POST } from './route';
const organizationId = '11111111-1111-4111-8111-111111111111';
const request = (body: unknown = { target: 'approved.example', type: 'headers' }, origin = 'https://ophanim.example') =>
  new NextRequest('http://localhost/api/scanner', { method: 'POST', headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries({ APP_URL: 'https://ophanim.example', SCANNER_URL: 'http://worker:8080',
    SCANNER_KEY: 'synthetic-dedicated-token-long-enough', SCANNER_ORGANIZATION_ID: organizationId, SCANNER_ALLOWED_TARGETS: 'approved.example' })) vi.stubEnv(name, value);
  mocks.actor.mockResolvedValue({ organizationId, userId: 'synthetic-user', authProvider: 'legacy' });
  mocks.limited.mockReturnValue(false); mocks.inspect.mockResolvedValue({ target: 'approved.example', risk: 'unknown' });
});
afterEach(() => vi.unstubAllEnvs());
it('GET never executes an inspection and POST requires a real session with cyber permission', async () => {
  expect((await GET()).status).toBe(405);
  mocks.actor.mockRejectedValueOnce(new OrganizationAccessError('Authentication is required.'));
  const unsigned = await POST(request()); expect(unsigned.status).toBe(401);
  expect((await unsigned.json()).signInHref).toBe('/login?returnTo=%2Fatlas');
  mocks.actor.mockRejectedValueOnce(new OrganizationAccessError()); expect((await POST(request())).status).toBe(403);
  expect(mocks.inspect).not.toHaveBeenCalled();
  expect(mocks.actor).toHaveBeenCalledWith(expect.anything(), 'cyber:write');
});
it('rejects cross-origin, demo, cross-tenant and unauthorized targets before worker transport', async () => {
  expect((await POST(request(undefined, 'https://foreign.example'))).status).toBe(403);
  mocks.actor.mockResolvedValueOnce({ organizationId, userId: 'demo', authProvider: 'presentation-demo' });
  expect((await POST(request())).status).toBe(403);
  mocks.actor.mockResolvedValueOnce({ organizationId: 'other-tenant', userId: 'other' }); expect((await POST(request())).status).toBe(403);
  expect((await POST(request({ target: 'unapproved.example' }))).status).toBe(403);
  expect(mocks.inspect).not.toHaveBeenCalled();
});
it('rejects URLs, wildcards, unavailable modes and caller configuration fields', async () => {
  for (const body of [{ target: 'https://approved.example' }, { target: '*.example' }, { target: 'approved.example', type: 'vuln' },
    { target: 'approved.example', key: 'caller-secret' }, { target: 'approved.example', organizationId: 'foreign' }]) expect((await POST(request(body))).status).toBe(400);
  const oversized = await POST(request({ target: 'x'.repeat(2200) })); expect(oversized.status).toBe(400);
  expect(mocks.inspect).not.toHaveBeenCalled();
});
it('reports configuration, rate and transport failures without private values', async () => {
  vi.stubEnv('SCANNER_KEY', ''); expect((await POST(request())).status).toBe(503);
  vi.stubEnv('SCANNER_KEY', 'synthetic-dedicated-token-long-enough');
  mocks.limited.mockReturnValueOnce(true); expect((await POST(request())).status).toBe(429);
  mocks.inspect.mockRejectedValueOnce(new Error('synthetic-private-secret-body'));
  const failed = await POST(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('synthetic-private');
});
it('permits the matching organization and scopes rate limiting to that actor', async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.limited).toHaveBeenCalledWith(`recon:${organizationId}:synthetic-user`, 5, 60000);
  expect(mocks.inspect).toHaveBeenCalledWith(expect.objectContaining({ organizationId, targets: ['approved.example'] }), { target: 'approved.example', mode: 'headers' });
});
