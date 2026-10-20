import { describe, expect, it, vi } from 'vitest';
import { SPECIALIST_SOURCES, normalizeSpecialist, specialistEventProviders } from './specialist-providers';
import { validateNormalizedIntelligenceEvent } from './event-provider';
const raw = (payload: unknown) => ({ payload, fetchedAt: '2026-10-19T12:00:00.000Z', mode: 'stale' as const, staleSince: '2026-10-19T12:05:00.000Z' });
describe('registered official public intelligence', () => {
  it('shares non-country source fetches across country selections without defeating the source cadence', async () => {
    const fetcher = vi.fn(async () => new Response('<rss version="2.0"><channel><title>Test</title><item><title>Official advisory</title><link>https://www.nhc.noaa.gov/</link></item></channel></rss>'));
    vi.stubGlobal('fetch', fetcher);
    try {
      const provider = specialistEventProviders.find(item => item.id === 'nhc-pacific')!;
      const context = { signal: new AbortController().signal, now: new Date(), since: new Date(), limit: 100 };
      await provider.fetch({ ...context, parameters: { country: 'united-arab-emirates' } });
      await provider.fetch({ ...context, parameters: { country: 'united-kingdom' } });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('records explicit rights, attribution, key and rate rules for every new source', () => {
    for (const source of SPECIALIST_SOURCES) {
      expect(source.commercialUse).toBe('yes'); expect(source.licence).toBeTruthy(); expect(source.termsUrl).toMatch(/^https:/); expect(source.rateLimits).toBeTruthy(); expect(source.keyNeeded).toBe(false);
      expect(specialistEventProviders.find(provider => provider.id === source.id)?.compliance?.().commercialUse).toBe(source.commercialUse);
    }
  });
  it('retains actual NOAA warning times and does not invent polygon centroids', () => {
    const source = SPECIALIST_SOURCES.find(item => item.format === 'nws')!;
    const events = normalizeSpecialist(source, raw({ features: [{ properties: { id: 'warning-1', headline: 'Flood warning', description: 'Official warning text', sent: '2026-10-19T10:00:00Z', expires: '2026-10-19T14:00:00Z', severity: 'Severe', areaDesc: 'Test area' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] } }] }), 20);
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ severity: 75, startedAt: '2026-10-19T10:00:00.000Z', location: { label: 'Test area' }, attributes: { dataMode: 'stale' } });
    expect(events[0].location.latitude).toBeUndefined(); expect(() => validateNormalizedIntelligenceEvent(events[0])).not.toThrow();
  });
  it('preserves original language and unknown publication dates without assigning hazard severity', () => {
    const source = SPECIALIST_SOURCES.find(item => item.language === 'es')!;
    const events = normalizeSpecialist(source, raw([{ title: 'Aviso de ciclón', link: 'https://www.nhc.noaa.gov/example', contentSnippet: '<script>alert(1)</script>Texto' }]), 100);
    expect(events[0].startedAt).toBeUndefined(); expect(events[0].severity).toBe(0); expect(events[0].attributes.originalLanguage).toBe('es'); expect(events[0].summary).not.toContain('<script>');
  });
  it('uses the original country advisory link and source update time', () => {
    const source = SPECIALIST_SOURCES.find(item => item.format === 'govuk')!;
    const events = normalizeSpecialist(source, raw({ title: 'UAE travel advice', description: 'Advice from FCDO', base_path: '/foreign-travel-advice/united-arab-emirates', public_updated_at: '2026-10-18T10:00:00Z' }), 100);
    expect(events[0].sources[0].url).toContain('united-arab-emirates'); expect(events[0].sources[0].retrievedAt).toBe('2026-10-19T12:00:00.000Z');
  });
  it('preserves and flags future source publication times without ranking them as current events', () => {
    const source = SPECIALIST_SOURCES.find(item => item.id === 'nhc-atlantic')!;
    const [event] = normalizeSpecialist(source, raw([{ title: 'Source clock issue', link: 'https://www.nhc.noaa.gov/', isoDate: '2026-10-21T00:00:00Z' }]), 10);
    expect(event.startedAt).toBeUndefined();
    expect(event.attributes.reportedPublishedAt).toBe('2026-10-21T00:00:00.000Z');
    expect(event.attributes.publicationAnomaly).toContain('later than retrieval');
  });
});
