import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { ShodanError } from '@/lib/shodan/types';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), limited: vi.fn(), search: vi.fn(), count: vi.fn(), host: vi.fn(), hosts: vi.fn(), resolve: vi.fn(), reverse: vi.fn(), info: vi.fn(), status: vi.fn(), scan: vi.fn(), warnings: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.auth }));
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: mocks.limited, getClientIp: () => 'fixture-ip' }));
vi.mock('@/lib/shodan/client', () => ({ shodanClient: () => mocks }));
vi.mock('@/lib/shodan/scans', () => ({ getScanStatus: mocks.status, submitScan: mocks.scan }));
import { GET, POST } from './route';

const actor = { organizationId: 'org-one', userId: 'user-one', role: 'owner' };
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue(actor); mocks.limited.mockReturnValue(false);
  mocks.warnings.mockReturnValue([]);
  for (const name of ['search', 'count', 'host', 'hosts', 'resolve', 'reverse', 'info', 'status', 'scan'] as const) mocks[name].mockResolvedValue({ fixture: name });
});
describe('Authenticated Shodan route', () => {
  it.each([['search', 'q=nginx&page=2&facets=org', 'search'], ['count', 'q=nginx', 'count'], ['host', 'ip=203.0.113.1', 'host'], ['hosts', 'ips=203.0.113.1', 'hosts'], ['resolve', 'hostnames=fixture.example', 'resolve'], ['reverse', 'ips=203.0.113.1', 'reverse'], ['api-info', '', 'info'], ['scan-status', 'scan_id=fixture-scan', 'status']])('dispatches %s without exposing the key', async (operation, params, method) => {
    const response = await GET(new NextRequest(`http://localhost/api/osint/shodan?operation=${operation}&${params}`));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ fixture: method });
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'cyber:read');
  });
  it('supports the legacy ip query parameter as an authenticated host lookup', async () => {
    const response = await GET(new NextRequest('http://localhost/api/osint/shodan?ip=203.0.113.1&history=true&minify=false'));
    expect(response.status).toBe(200);
    expect(mocks.host).toHaveBeenCalledWith('203.0.113.1', true, false, expect.anything());
  });
  it('rejects unauthenticated reads and typed missing-key errors', async () => {
    mocks.auth.mockRejectedValueOnce(new OrganizationAccessError('Authentication is required.'));
    expect((await GET(new NextRequest('http://localhost/api/osint/shodan?operation=api-info'))).status).toBe(403);
    mocks.info.mockRejectedValueOnce(new ShodanError('missing_key', 'Set SHODAN_API_KEY.', 503));
    const response = await GET(new NextRequest('http://localhost/api/osint/shodan?operation=api-info'));
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: 'missing_key' });
  });
  it('never exposes raw database or credential-bearing unexpected errors', async () => {
    mocks.info.mockRejectedValueOnce(new Error('https://api.shodan.io?key=secret'));
    const response = await GET(new NextRequest('http://localhost/api/osint/shodan?operation=api-info'));
    expect(await response.text()).not.toContain('secret');
  });
  it('enforces local request limits before contacting the provider', async () => {
    mocks.limited.mockReturnValueOnce(true);
    expect((await GET(new NextRequest('http://localhost/api/osint/shodan?operation=api-info'))).status).toBe(429);
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it('rejects cross-origin scan submissions', async () => {
    const response = await POST(new NextRequest('http://localhost/api/osint/shodan', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' }));
    expect(response.status).toBe(403); expect(mocks.scan).not.toHaveBeenCalled();
  });
  it('passes a confirmed submission to the owner-gated audit service', async () => {
    const body = { ips: '203.0.113.1', confirm: true, requestId: '00000000-0000-4000-8000-000000000001' };
    const response = await POST(new NextRequest('http://localhost/api/osint/shodan', { method: 'POST', headers: { Origin: 'http://localhost' }, body: JSON.stringify(body) }));
    expect(response.status).toBe(200); expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'organization:manage');
    expect(mocks.scan).toHaveBeenCalledWith(actor, body);
  });
  it('rejects invalid JSON, unknown operations and invalid boolean flags', async () => {
    expect((await POST(new NextRequest('http://localhost/api/osint/shodan', { method: 'POST', body: 'broken' }))).status).toBe(400);
    expect((await GET(new NextRequest('http://localhost/api/osint/shodan?operation=bad'))).status).toBe(400);
    expect((await GET(new NextRequest('http://localhost/api/osint/shodan?ip=203.0.113.1&history=maybe'))).status).toBe(400);
  });
});
