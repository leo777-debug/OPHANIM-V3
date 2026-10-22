import { describe, expect, it } from 'vitest';
import { clusterHazards } from './hazard-clustering';
import { normalizeGdacs, gdacsHazardProvider } from './gdacs-provider';
import { collectIntelligenceEvents, IntelligenceEventProviderRegistry } from './event-provider-registry';
const now = Date.parse('2026-10-20T12:00:00Z');
function event(id: string, providerId: string, latitude = 0, minute = 0) {
  const [normalized] = normalizeGdacs({ features: [{ properties: { eventid: id, eventtype: 'EQ', name: 'Reported earthquake', fromdate: `2026-10-20T10:${String(minute).padStart(2, '0')}:00Z`, alertlevel: 'orange' }, geometry: { type: 'Point', coordinates: [0, latitude] } }] }, '2026-10-20T11:00:00Z');
  return { ...normalized, providerId, externalId: id };
}
describe('conservative hazard identity matching', () => {
  it('preserves both source reports in one possible group within the spatial/time window', () => {
    const reports = [event('one', 'usgs', 0, 0), event('two', 'gdacs', 0.1, 2)];
    const groups = clusterHazards(reports, now);
    expect(groups).toHaveLength(1); expect(groups[0].reports).toHaveLength(2); expect(groups[0].matching).toBe('possible same hazard');
    expect(clusterHazards(reports.toReversed(), now)).toEqual(groups);
  });
  it('keeps same-provider events and ambiguous multi-event matches separate', () => {
    const groups = clusterHazards([event('one', 'usgs', 0, 0), event('two', 'usgs', 0.1, 1), event('three', 'gdacs', 0.05, 3)], now);
    expect(groups).toHaveLength(3); expect(groups.find(group => group.anchor.externalId === 'three')?.ambiguity).toContain('2 plausible');
    expect(clusterHazards([event('one', 'usgs'), event('two', 'gdacs', 0, 30)], now)).toHaveLength(2);
  });
  it('does not transitively merge distant events or merge unknown/future/private reports', () => {
    expect(clusterHazards([event('one', 'a', 0), event('two', 'b', 0.4, 1), event('three', 'c', 0.8, 2)], now)).toHaveLength(2);
    const base = event('one', 'a');
    expect(clusterHazards([base, { ...event('two', 'b'), startedAt: undefined }, { ...event('three', 'c'), location: { label: 'Unknown' } }, { ...event('four', 'd'), startedAt: '2026-10-21T00:00:00Z' }, { ...base, providerId: 'private', organizationScope: 'org' }], now)).toHaveLength(4);
  });
  it('requires distinctive names for non-seismic events and retains the latest copy of an identity', () => {
    const a = { ...event('a', 'one'), eventType: 'severe_storm', title: 'Hurricane Ian' }, b = { ...event('b', 'two'), eventType: 'severe_storm', title: 'Tropical cyclone Ian' };
    expect(clusterHazards([a, b], now)).toHaveLength(1);
    expect(clusterHazards([a, { ...b, title: 'Hurricane Bob' }], now)).toHaveLength(2);
    const newer = { ...a, title: 'Updated source title', sources: a.sources.map(source => ({ ...source, retrievedAt: '2026-10-20T12:00:00Z' })) };
    expect(clusterHazards([a, newer], now)[0].anchor.title).toBe(newer.title);
  });
  it('never fetches the licence-disabled GDACS connector', async () => {
    const result = await collectIntelligenceEvents({ providerIds: ['gdacs-hazards'] }, new IntelligenceEventProviderRegistry([gdacsHazardProvider]));
    expect(result.events).toEqual([]); expect(result.diagnostics[0]).toMatchObject({ status: 'skipped' });
    expect(result.diagnostics[0].message).toContain('Commercial use');
    await expect(gdacsHazardProvider.fetch({ now: new Date(), since: new Date(), signal: new AbortController().signal, limit: 10 })).rejects.toThrow('Disabled by licence');
  });
});
