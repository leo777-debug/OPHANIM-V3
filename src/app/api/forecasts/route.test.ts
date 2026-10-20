import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PATCH } from './route';
import { OrganizationAccessError } from '@/lib/operations/authorization';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), create: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.actor }));
vi.mock('@/lib/intelligence/forecasts', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/intelligence/forecasts')>(), listForecasts: mocks.list, createForecast: mocks.create, resolveForecast: mocks.resolve }));
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: () => false }));
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockRejectedValue(new OrganizationAccessError()); });
describe('private forecast API', () => {
  it('rejects unauthenticated reads and writes before accessing records', async () => {
    expect((await GET(new NextRequest('http://localhost/api/forecasts'))).status).toBe(403);
    expect((await POST(new NextRequest('http://localhost/api/forecasts', { method: 'POST', body: '{}' }))).status).toBe(403);
    expect((await PATCH(new NextRequest('http://localhost/api/forecasts', { method: 'PATCH', body: '{}' }))).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('rejects cross-origin changes and uses the server actor for reads', async () => {
    const actor = { organizationId: 'server-org', userId: 'user', role: 'owner' }; mocks.actor.mockResolvedValue(actor); mocks.list.mockResolvedValue([]);
    expect((await POST(new NextRequest('http://localhost/api/forecasts', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' }))).status).toBe(403);
    const response = await GET(new NextRequest('http://localhost/api/forecasts?organizationId=other-org'));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(mocks.list).toHaveBeenCalledWith(actor);
    expect((await response.json()).writable).toBe(true);
  });
  it('reports read-only capability for a viewer without exposing mutation controls', async () => {
    mocks.actor.mockResolvedValue({ organizationId: 'server-org', userId: 'viewer', role: 'viewer' }); mocks.list.mockResolvedValue([]);
    expect((await (await GET(new NextRequest('http://localhost/api/forecasts'))).json()).writable).toBe(false);
  });
});
