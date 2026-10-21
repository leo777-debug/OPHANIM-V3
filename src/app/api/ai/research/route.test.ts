import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { OrganizationAccessError } from '@/lib/operations/authorization';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), research: vi.fn(), configured: vi.fn(), audit: vi.fn(), enabled: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.actor }));
vi.mock('@/lib/ssrf-guard', () => ({ getClientIp: () => '192.0.2.1', isRateLimited: () => false }));
vi.mock('@/lib/operations/feature-flags', () => ({ isFeatureEnabled: mocks.enabled }));
vi.mock('@/lib/watchlists/db', () => ({ db: () => ({ query: mocks.audit }) }));
vi.mock('@/lib/ai/sandbox-research', async original => ({
  ...await original<typeof import('@/lib/ai/sandbox-research')>(), researchInSandbox: mocks.research, sandboxResearchConfigured: mocks.configured,
}));
import { POST } from './route';
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('APP_URL', 'https://ophanim.example');
  mocks.actor.mockResolvedValue({ organizationId: 'organization-fixture', userId: 'user-fixture' });
  mocks.configured.mockReturnValue(true); mocks.enabled.mockReturnValue(true);
  mocks.research.mockResolvedValue({ summary: 'Fixture only', sources: [] }); mocks.audit.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
const request = (origin = 'https://ophanim.example', body = { subject: 'Public hazard', purpose: 'confirm' }) =>
  new NextRequest('http://localhost/api/ai/research', { method: 'POST', headers: { origin }, body: JSON.stringify(body) });
it('requires a valid session and research permission before any worker request', async () => {
  mocks.actor.mockRejectedValueOnce(new OrganizationAccessError('Authentication is required.'));
  expect((await POST(request())).status).toBe(401);
  mocks.actor.mockRejectedValueOnce(new OrganizationAccessError());
  expect((await POST(request())).status).toBe(403);
  expect(mocks.research).not.toHaveBeenCalled();
});
it('accepts the configured public origin behind an internal host and audits the authenticated organization', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.actor).toHaveBeenCalledWith(expect.anything(), 'research:run');
  expect(mocks.audit.mock.calls[0][1].slice(0, 2)).toEqual(['organization-fixture', 'user-fixture']);
  expect((await POST(request('https://foreign.example'))).status).toBe(403);
  expect(mocks.research).toHaveBeenCalledTimes(1);
});
it('keeps missing configuration and invalid input clear without sending context', async () => {
  mocks.configured.mockReturnValueOnce(false);
  const response = await POST(request());
  expect(response.status).toBe(503); expect((await response.json()).error).toContain('Admin → Integrations');
  expect((await POST(request(undefined, { subject: 'x', purpose: 'confirm' }))).status).toBe(400);
  expect(mocks.research).not.toHaveBeenCalled();
});
it('redacts worker and audit exceptions and never marks an unaudited request complete', async () => {
  mocks.research.mockRejectedValueOnce(new Error('synthetic-secret-upstream-body'));
  const failure = await POST(request()); expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain('synthetic-secret');
  expect(mocks.audit).not.toHaveBeenCalled();
  mocks.audit.mockRejectedValueOnce(new Error('synthetic-secret-database-connection'));
  const auditFailure = await POST(request()); expect(auditFailure.status).toBe(503);
  expect(await auditFailure.text()).not.toContain('synthetic-secret');
});
