import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
const collect = vi.hoisted(() => vi.fn());
vi.mock('@/lib/intelligence/event-provider-registry', () => ({ collectIntelligenceEvents: collect }));
vi.mock('@/lib/ssrf-guard', () => ({ getClientIp: () => 'client', isRateLimited: () => false }));
beforeEach(() => { vi.clearAllMocks(); collect.mockResolvedValue({ events: [], diagnostics: [] }); });
describe('public aviation boundary', () => {
  it('requests only permitted providers and reports missing weather rather than normal operation', async () => {
    const body = await (await GET(new NextRequest('http://localhost/api/aviation-disruptions?stations=KJFK,KLAX&organizationId=other'))).json();
    expect(collect).toHaveBeenCalledWith({ providerIds: ['faa-public-status', 'awc-us-metar', 'awc-us-taf'], parameters: { stations: 'KJFK,KLAX' }, limitPerProvider: 100 });
    expect(body.missingMetarStations).toEqual(['KJFK', 'KLAX']); expect(body.coverage).toContain('conditional');
  });
  it('rejects international/untrusted station input before contacting any provider', async () => {
    expect((await GET(new NextRequest('http://localhost/api/aviation-disruptions?stations=OMDB'))).status).toBe(400);
    expect(collect).not.toHaveBeenCalled();
  });
});
