import type { IntelligenceEventProvider, NormalizedIntelligenceEvent } from '@/lib/intelligence/event-provider';
import { validateNormalizedIntelligenceEvent } from '@/lib/intelligence/event-provider';
import { isRateLimited } from '@/lib/ssrf-guard';
import { fetchArticle } from './url-fetch';

type Metar = { icaoId?: string; obsTime?: number; lat?: number; lon?: number; visib?: number | string; wxString?: string; rawOb?: string };
export const airportWeatherProvider: IntelligenceEventProvider<Metar[]> = {
  id: 'verify-airport-weather', name: 'NOAA Aviation Weather METAR', pack: 'weather_disaster', sourceId: 'noaa-metar',
  costType: 'free', mode: 'FREE', supportedEventTypes: ['airport_weather'], requiresCredentials: false, timeoutMs: 8000, queryOnly: true,
  // International reports can be third-party material: require an explicit rights review.
  compliance: () => ({ license: 'NWS public domain; third-party reports require review', commercialUse: process.env.VERIFY_METAR_COMMERCIAL_USE === 'yes' ? 'yes' : 'unknown', attribution: 'NOAA/NWS Aviation Weather Center. Ophanim interpretation; no NOAA endorsement.', rateLimits: '100 requests/minute upstream; 5/minute/application; 60-second station cache', termsUrl: 'https://www.weather.gov/disclaimer' }),
  isConfigured: () => true,
  async fetch(context) {
    const code = context.parameters?.airportCode;
    if (!code || !/^[A-Z]{4}$/.test(code)) throw new Error('A confirmed four-letter ICAO airport code is required.');
    const cached = metarCache.get(code); if (cached && Date.now() - cached.at < 60000) return cached.data;
    if (isRateLimited('verify:noaa:upstream', 5)) throw new Error('METAR source rate limit reached; try again later.');
    const response = await fetch(`https://aviationweather.gov/api/data/metar?ids=${code}&format=json&hours=24`, { signal: context.signal, headers: { 'User-Agent': 'OphanimVerify/1.0', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`NOAA returned HTTP ${response.status}.`);
    const data = response.status === 204 ? [] : await response.json() as Metar[];
    if (!Array.isArray(data)) throw new Error('Invalid METAR response.');
    for (const [key, item] of metarCache) if (Date.now() - item.at >= 60000) metarCache.delete(key);
    metarCache.set(code, { at: Date.now(), data }); return data;
  },
  normalize(raw, context) {
    return raw.slice(0, context.limit).flatMap((item) => {
      if (!item.icaoId || !Number.isFinite(item.obsTime) || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return [];
      const observed = new Date(item.obsTime! * 1000).toISOString();
      const visibility = Number(item.visib), fog = /\b(FG|BR)\b/.test(item.wxString ?? '');
      return [{ externalId: `metar:${item.icaoId}:${item.obsTime}`, providerId: 'verify-airport-weather', organizationScope: null,
        pack: 'weather_disaster', eventType: 'airport_weather', title: `METAR ${item.icaoId}`,
        summary: `${item.icaoId}: ${fog ? 'fog or mist reported' : 'no fog code reported'}; visibility ${item.visib ?? 'not reported'} statute miles. Weather does not prove an airport closure.`,
        entities: [{ type: 'location', value: item.icaoId }], location: { latitude: item.lat, longitude: item.lon }, startedAt: observed,
        severity: 0, confidence: 100, verificationState: 'confirmed', sources: [{ id: 'noaa-metar', name: 'NOAA Aviation Weather Center', url: `https://aviationweather.gov/data/metar/?id=${item.icaoId}`, sourceType: 'primary_authority', publishedAt: observed, retrievedAt: context.now.toISOString() }],
        rawEvidenceRefs: [{ providerRecordId: `${item.icaoId}:${item.obsTime}` }], deduplicationKey: `metar:${item.icaoId}:${item.obsTime}`,
        attributes: { airportCode: item.icaoId, fog, lowVisibility: Number.isFinite(visibility) && visibility < 1 },
      } satisfies NormalizedIntelligenceEvent];
    });
  },
};
const metarCache = new Map<string, { at: number; data: Metar[] }>();

export const observationsProvider: IntelligenceEventProvider = {
  id: 'verify-observations', name: 'Configured public verification observations', sourceId: 'verify-observations', pack: 'osint_news',
  costType: 'customer_hosted', mode: 'CUSTOMER_HOSTED', requiresCredentials: false, timeoutMs: 8000, queryOnly: true,
  supportedEventTypes: ['airport_movements', 'airport_diversions', 'airport_closure', 'ship_attacked', 'ship_seized', 'port_closed', 'sanctions_update', 'tropical_cyclone', 'flood', 'news_event'],
  compliance: () => ({ license: process.env.VERIFY_OBSERVATIONS_LICENSE ?? 'Unknown', commercialUse: process.env.VERIFY_OBSERVATIONS_COMMERCIAL_USE === 'yes' && Boolean(process.env.VERIFY_OBSERVATIONS_LICENSE && process.env.VERIFY_OBSERVATIONS_ATTRIBUTION && process.env.VERIFY_OBSERVATIONS_TERMS_URL) ? 'yes' : 'unknown', attribution: process.env.VERIFY_OBSERVATIONS_ATTRIBUTION ?? 'Not configured', rateLimits: '5 requests/minute/application; configure upstream within its published limit', termsUrl: process.env.VERIFY_OBSERVATIONS_TERMS_URL ?? '' }),
  isConfigured: () => Boolean(process.env.VERIFY_OBSERVATIONS_URL),
  async fetch() {
    if (isRateLimited('verify:observations:upstream', 5)) throw new Error('Observation source rate limit reached.');
    // Same pinned, bounded public-address transport as user article fetching; JSON is supplied as plain text.
    const snapshot = await fetchArticle(process.env.VERIFY_OBSERVATIONS_URL!, { json: true });
    return JSON.parse(snapshot.text);
  },
  normalize(raw, context) {
    if (!Array.isArray(raw)) throw new Error('Observation feed must be an array of normalized events.');
    const tiers = JSON.parse(process.env.VERIFY_SOURCE_TIERS ?? '{}') as Record<string, string>;
    const groups = JSON.parse(process.env.VERIFY_SOURCE_GROUPS ?? '{}') as Record<string, string>;
    return raw.slice(0, context.limit).map((value) => {
      const event = validateNormalizedIntelligenceEvent(value as NormalizedIntelligenceEvent);
      if (event.organizationScope !== null) throw new Error('Verify accepts only public evidence, never organization records.');
      return { ...event, providerId: 'verify-observations', summary: event.summary.slice(0, 240),
        sources: event.sources.map((source) => ({ ...source, retrievedAt: context.now.toISOString(), sourceType: tiers[source.id] === 'official' ? 'primary_authority' as const : ['wire', 'established_media'].includes(tiers[source.id]) ? 'trusted_news' as const : 'unverified' as const })),
        attributes: { ...event.attributes, trustTier: event.sources.every((source) => tiers[source.id] === 'wire') ? 'wire' : undefined,
          independenceKeys: Object.fromEntries(event.sources.map((source) => [source.id, groups[source.id] || 'independence-not-reviewed'])) },
      };
    });
  },
};
export const verifyEventProviders: IntelligenceEventProvider[] = [airportWeatherProvider, observationsProvider];
