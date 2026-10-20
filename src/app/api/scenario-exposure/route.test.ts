import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrganizationAccessError } from '@/lib/operations/authorization';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), shipments: vi.fn(), assess: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: mocks.actor }));
vi.mock('@/lib/logistics/shipments', () => ({ listShipments: mocks.shipments }));
vi.mock('@/lib/route-intelligence/scenarios', async () => ({ ...await vi.importActual('@/lib/route-intelligence/scenarios'), assessShipmentScenario: mocks.assess }));
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: () => false }));
import { POST } from './route';
const request = () => new NextRequest('https://app.example/api/scenario-exposure', { method: 'POST', body: JSON.stringify({ type: 'chokepoint_closed', passage: 'suez', days: 7, organizationId: 'attacker-chosen-org' }) });
afterEach(() => vi.resetAllMocks());
describe('organization scenario isolation', () => {
  it('rejects signed-out callers before reading shipments', async () => {
    mocks.actor.mockRejectedValue(new OrganizationAccessError()); expect((await POST(request())).status).toBe(403); expect(mocks.shipments).not.toHaveBeenCalled();
  });
  it('derives tenancy from the session and accepts no client-selected organization', async () => {
    const actor = { organizationId: 'session-org', userId: 'user', role: 'analyst' };
    mocks.actor.mockResolvedValue(actor); mocks.shipments.mockResolvedValue([{ id: 'own-shipment' }]); mocks.assess.mockResolvedValue({ reports: [] });
    const response = await POST(request()); expect(response.status).toBe(200); expect(mocks.shipments).toHaveBeenCalledWith(actor);
    expect(mocks.assess).toHaveBeenCalledWith([{ id: 'own-shipment' }], { type: 'chokepoint_closed', passage: 'suez', days: 7 }); expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
