import { NextRequest } from 'next/server';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { OrganizationAccessError, requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor, OrganizationPermission } from '@/lib/operations/types';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), fetch: vi.fn(), limited: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.auth }));
vi.mock('@/lib/watchlists/db', () => ({ db: () => ({ query: mocks.query }) }));
vi.mock('@/lib/ssrf-guard', () => ({ validateHost: async () => ({ ok: true }), isRateLimited: mocks.limited, getClientIp: () => 'fixture-ip' }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SCANNER_URL', 'https://scanner.example.test');
  vi.stubEnv('SCANNER_KEY', 'synthetic-scanner-credential');
  vi.stubEnv('AUTHORIZED_SCAN_TARGETS', JSON.stringify({ 'org-a': ['203.0.113.10'] }));
  mocks.auth.mockResolvedValue({ userId: 'user-a', organizationId: 'org-a', role: 'owner' });
  mocks.limited.mockReturnValue(false);
  mocks.query.mockResolvedValue({ rows: [{ id: 'audit-a' }] });
  mocks.fetch.mockResolvedValue(Response.json({ scan_type: 'quick', ports: [443] }));
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('does not let an anonymous GET trigger a scanner backend', async () => {
  mocks.auth.mockRejectedValue(new OrganizationAccessError('Authentication is required.'));
  const { GET } = await import('./route');
  const response = await GET(new NextRequest('http://localhost/api/scanner?target=203.0.113.10&type=quick'));
  expect(response.status).toBe(401);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

function request(body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/scanner', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ target: '203.0.113.10', type: 'quick', confirm: true, ...body }) });
}
it('never scans on authenticated GET either', async () => {
  const { GET } = await import('./route');
  const result = await GET(new NextRequest('http://localhost/api/scanner?target=203.0.113.10'));
  expect(result.status).toBe(405); expect(result.headers.get('allow')).toBe('POST');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('requires the owner permission and denies anonymous POST', async () => {
  mocks.auth.mockRejectedValue(new OrganizationAccessError('Authentication is required.'));
  const { POST } = await import('./route');
  expect((await POST(request())).status).toBe(401);
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'organization:manage');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each(['viewer', 'analyst', 'operations_manager'] as const)('denies a %s without contacting the backend', async (role) => {
  mocks.auth.mockImplementation(async (_request: NextRequest, permission: OrganizationPermission) => {
    const actor: OrganizationActor = { userId: 'user-a', organizationId: 'org-a', role };
    requireOrganizationAccess(actor, actor.organizationId, permission);
    return actor;
  });
  const { POST } = await import('./route');
  expect((await POST(request())).status).toBe(403);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each([{ confirm: false }, { target: 'fixture.example' }, { target: '203.0.113.0/24' }])('rejects missing confirmation or nonliteral targets %j', async (body) => {
  const { POST } = await import('./route');
  expect((await POST(request(body))).status).toBe(400);
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
});
it('does not accept another organization allowlist', async () => {
  mocks.auth.mockResolvedValue({ userId: 'user-b', organizationId: 'org-b', role: 'owner' });
  const { POST } = await import('./route');
  expect((await POST(request())).status).toBe(403); expect(mocks.fetch).not.toHaveBeenCalled();
});
it('rejects a target outside the approved CIDR', async () => {
  const { POST } = await import('./route');
  expect((await POST(request({ target: '203.0.113.11' }))).status).toBe(403); expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each<Record<string, string>>([{ Origin: 'https://other.example' }, { 'sec-fetch-site': 'cross-site' }])('rejects cross-site submissions %j', async (headers) => {
  const { POST } = await import('./route');
  expect((await POST(request({}, headers))).status).toBe(403); expect(mocks.fetch).not.toHaveBeenCalled();
});
it('fails closed if the audit database is unavailable', async () => {
  mocks.query.mockRejectedValue(new Error('synthetic-db-password'));
  const { POST } = await import('./route');
  const result = await POST(request());
  expect(result.status).toBe(503); expect(await result.text()).not.toContain('synthetic-db-password');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('records actor, workspace and target before sending one confirmed request', async () => {
  mocks.fetch.mockImplementation(async () => {
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('insert into ophanim_audit_events'), ['org-a', 'user-a', expect.stringContaining('203.0.113.10')]);
    return Response.json({ scan_type: 'quick', ports: [443] });
  });
  const { POST } = await import('./route');
  const result = await POST(request());
  expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('no-store');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }));
  expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('scanner.scan.completed'), ['audit-a', 'org-a']);
});
it('redacts provider echoes and hides raw provider failures', async () => {
  mocks.fetch.mockResolvedValueOnce(Response.json({ nested: { url: 'synthetic-scanner-credential' } }));
  const { POST } = await import('./route');
  expect(await (await POST(request())).text()).not.toContain('synthetic-scanner-credential');
  mocks.fetch.mockRejectedValueOnce(new Error('https://scanner.example.test?key=synthetic-scanner-credential'));
  const failed = await POST(request());
  expect(failed.status).toBe(502); expect(await failed.text()).not.toContain('synthetic-scanner-credential');
  expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('scanner.scan.unconfirmed'), ['audit-a', 'org-a']);
});
it('enforces a shared user rate limit before submission', async () => {
  mocks.limited.mockReturnValue(true);
  const { POST } = await import('./route');
  expect((await POST(request())).status).toBe(429); expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.limited).toHaveBeenCalledWith('scanner:user:user-a', 3, 60000);
});
it('clearly reports missing credentials without contacting the provider', async () => {
  vi.stubEnv('SCANNER_KEY', '');
  const { POST } = await import('./route');
  expect((await POST(request())).status).toBe(503); expect(mocks.fetch).not.toHaveBeenCalled();
});
