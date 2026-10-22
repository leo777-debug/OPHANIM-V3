import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ actor: vi.fn(), transport: vi.fn(), socket: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ getAuthenticatedActor: mocks.actor }));
vi.mock('@/lib/integrations/probes', () => ({ requestIntegration: mocks.transport }));
vi.mock('ws', () => ({ default: class { constructor() { mocks.socket(); } on() {} } }));
const organization = '10000000-0000-4000-8000-000000000001';
const request = (query = '') => new NextRequest('http://localhost/api/maritime' + query);

describe('public AIS (Digitraffic + AISStream) and organization-licensed AIS isolation', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    vi.stubEnv('CUSTOMER_AIS_API_URL', 'https://customer.example.invalid/ships');
    vi.stubEnv('CUSTOMER_AIS_API_TOKEN', 'synthetic-server-only-token');
    vi.stubEnv('AIS_ORGANIZATION_ID', organization);
    vi.stubEnv('MARINETRAFFIC_AIS_API_URL', '');
    vi.stubEnv('AIS_API_KEY', 'synthetic-stream-key');
    vi.stubGlobal('shipsCache', new Map([[1, { mmsi: 1, name: 'STREAM SHIP', lat: 25, lng: 55, timestamp: Date.now() }]]));
    vi.stubGlobal('isAisConnecting', false);
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.endsWith('/locations')
      ? Response.json({ features: [{ geometry: { coordinates: [24, 60] }, properties: { mmsi: 2, sog: 5 } }] })
      : Response.json([{ mmsi: 2, name: 'PUBLIC BALTIC', shipType: 70 }])));
    mocks.actor.mockResolvedValue({ organizationId: organization, userId: 'fixture-user', role: 'owner' });
    mocks.transport.mockResolvedValue(JSON.stringify([{ mmsi: 3, name: 'PRIVATE CUSTOMER', lat: 26, lng: 56 }]));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('shows AISStream on public map requests but never calls organization-licensed sources', async () => {
    const { GET } = await import('./route');
    const response = await GET(request('?public=1'));
    const body = await response.json();
    expect(body.publicOnly).toBe(true);
    expect(body.ships.map((ship: {name: string}) => ship.name)).toEqual(['PUBLIC BALTIC', 'STREAM SHIP']);
    expect(body.sources).toContain('AISStream');
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|synthetic|Customer AIS/);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.transport).not.toHaveBeenCalled();
    expect(mocks.socket).toHaveBeenCalled();
  });
  it('never mixes a previously cached combined response into the public response', async () => {
    const { GET } = await import('./route');
    const combined = await GET(request());
    expect(combined.headers.get('Cache-Control')).toBe('private, no-store');
    expect(JSON.stringify(await combined.json())).toContain('PRIVATE CUSTOMER');
    const publicBody = await (await GET(request('?public=1'))).json();
    expect(publicBody.ships.map((ship: {name: string}) => ship.name)).toEqual(['PUBLIC BALTIC', 'STREAM SHIP']);
    expect(mocks.transport).toHaveBeenCalledTimes(1);
  });
  it('rejects unsigned or other-tenant requests before cached data or upstream calls', async () => {
    const { GET } = await import('./route');
    await GET(request());
    mocks.actor.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect((await GET()).status).toBe(401);
    mocks.actor.mockResolvedValue({ organizationId: 'another-organization' });
    expect((await GET(request())).status).toBe(403);
    vi.stubEnv('AIS_ORGANIZATION_ID', '');
    expect((await GET(request())).status).toBe(503);
    expect(mocks.transport).toHaveBeenCalledTimes(1);
  });
  it('serves AISStream without sign-in when no organization-licensed feed is configured', async () => {
    vi.stubEnv('CUSTOMER_AIS_API_URL', '');
    vi.stubEnv('AIS_ORGANIZATION_ID', '');
    mocks.actor.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sources).toContain('AISStream');
    expect(body.ships.map((ship: {name: string}) => ship.name)).toContain('STREAM SHIP');
    expect(mocks.actor).not.toHaveBeenCalled();
  });
});
