import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
const collect = vi.hoisted(() => vi.fn());
vi.mock('@/lib/intelligence/event-provider-registry', () => ({ collectIntelligenceEvents: collect }));
vi.mock('@/lib/ssrf-guard', () => ({ getClientIp: () => 'client', isRateLimited: () => false }));
describe('public hazards boundary', () => {
  it('requests only fixed public providers and excludes tenant records', async () => {
    collect.mockResolvedValue({ events: [{ externalId: 'private', providerId: 'private', organizationScope: 'org', eventType: 'earthquake', startedAt: '2026-10-20T10:00:00Z', sources: [], location: {} }], diagnostics: [] });
    const body = await (await GET(new NextRequest('http://localhost/api/public-hazards?organizationId=private'))).json();
    expect(collect).toHaveBeenCalledWith({ providerIds: ['usgs-earthquakes', 'nasa-eonet', 'gdacs-hazards'], limitPerProvider: 100 });
    expect(body.groups).toEqual([]); expect(body.coverage).toContain('remain off');
    expect(body.sources.find((source: { id: string }) => source.id === 'gdacs-hazards')).toMatchObject({ commercialUse: 'unknown', enabled: false });
  });
});
