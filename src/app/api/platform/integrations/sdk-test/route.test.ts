import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationAccessError } from '@/lib/operations/authorization';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limited: vi.fn(), persist: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.auth, getAuthenticatedActor: vi.fn() }));
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: mocks.limited }));
vi.mock('@/lib/runtime/store', () => ({ writeRuntimeValue: mocks.persist }));
import { POST } from './route';
import { sdkState } from '@/lib/sdk/ingestion';
const org = '11111111-1111-4111-8111-111111111111';
const request = (body: unknown = {}, origin = 'https://app.example') => new NextRequest('https://app.example/api/platform/integrations/sdk-test', { method: 'POST', headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('SDK_INGEST_KEY', 'server-fixture-never-echo'); vi.stubEnv('SDK_ORGANIZATION_ID', org); mocks.auth.mockResolvedValue({ organizationId: org }); mocks.persist.mockResolvedValue({ storage: 'memory' }); });
afterEach(() => { vi.unstubAllEnvs(); sdkState(); });
describe('SDK administrator diagnostic', () => {
  it('requires sign-in, admin permission and the configured tenant', async () => {
    mocks.auth.mockRejectedValue(new OrganizationAccessError('Authentication is required.')); expect((await POST(request())).status).toBe(401);
    mocks.auth.mockRejectedValue(new OrganizationAccessError()); expect((await POST(request())).status).toBe(403);
    mocks.auth.mockResolvedValue({ organizationId: 'another-org' }); expect((await POST(request())).status).toBe(403);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'organization:manage'); expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('rejects request-provided keys/URLs, cross-origin calls and rate excess', async () => {
    expect((await POST(request({ apiKey: 'key' }))).status).toBe(400);
    expect((await POST(request({}, 'https://other.example'))).status).toBe(403);
    mocks.limited.mockReturnValue(true); expect((await POST(request())).status).toBe(429);
  });
  it('passes a real server credential through ingestion validation with zero map/stream mutations', async () => {
    const response = await POST(request()), body = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('private');
    expect(body).toMatchObject({ accepted: 1, diagnostic: true, storage: 'memory' });
    expect(JSON.stringify(body)).not.toContain('server-fixture-never-echo'); expect(sdkState().entities.size).toBe(0); expect(sdkState().lastUpdate).toBe(0);
    expect(mocks.persist).toHaveBeenCalledWith('sdk-setup-tests', org, expect.objectContaining({ diagnostic: true }));
  });
});
