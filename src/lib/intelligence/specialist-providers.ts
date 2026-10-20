import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import { ResilientFeed } from '@/lib/providers/resilient-feed';
import { safeSourceUrl } from './news';
import type { IntelligenceEventProvider, NormalizedIntelligenceEvent } from './event-provider';

export interface SpecialistSource {
  id: string; name: string; url: string; licence: string; commercialUse: 'yes' | 'no' | 'unknown';
  termsUrl: string; attribution: string; rateLimits: string; keyNeeded: boolean;
  language: string; region: string; kind: string; format: 'rss' | 'nws' | 'govuk';
}
const nwsTerms = 'https://www.weather.gov/disclaimer';
export const SPECIALIST_SOURCES: SpecialistSource[] = [
  { id: 'noaa-public-warnings', name: 'NOAA/NWS public weather warnings', url: 'https://api.weather.gov/alerts/active?status=actual&message_type=alert', licence: 'US government public domain (NWS-authored text)', commercialUse: 'yes', termsUrl: nwsTerms, attribution: 'NOAA / National Weather Service; no endorsement. Source-authored warning text.', rateLimits: 'Upstream limit not published; application cache 5 minutes, one concurrent request/source/instance', keyNeeded: false, language: 'en', region: 'United States', kind: 'public_warning', format: 'nws' },
  ...[
    ['nhc-atlantic', 'NHC Atlantic cyclone advisories', 'https://www.nhc.noaa.gov/index-at.xml', 'en', 'Atlantic'],
    ['nhc-pacific', 'NHC Eastern Pacific cyclone advisories', 'https://www.nhc.noaa.gov/index-ep.xml', 'en', 'Eastern Pacific'],
    ['nhc-atlantic-es', 'NHC Atlantic advisories (Español)', 'https://www.nhc.noaa.gov/index-at-sp.xml', 'es', 'Atlantic'],
  ].map(([id, name, url, language, region]): SpecialistSource => ({ id, name, url, language, region, licence: 'US government public domain (NHC-authored text)', commercialUse: 'yes', termsUrl: nwsTerms, attribution: 'NOAA / National Hurricane Center. Original advisories; no endorsement.', rateLimits: 'Application cache 5 minutes; source cadence varies by bulletin', keyNeeded: false, kind: 'cyclone_advisory', format: 'rss' })),
  { id: 'cdc-travel-health', name: 'CDC Travel Health Notices', url: 'https://wwwnc.cdc.gov/travel/rss/notices.xml', licence: 'US government public domain (CDC-authored notices; excludes third-party media)', commercialUse: 'yes', termsUrl: 'https://www.cdc.gov/other/agencymaterials.html', attribution: 'US Centers for Disease Control and Prevention. No endorsement. Consult the linked current official notice.', rateLimits: 'Application cache 15 minutes; source rate limit not published', keyNeeded: false, language: 'en', region: 'International notices; coverage is not comprehensive', kind: 'health_notice', format: 'rss' },
  { id: 'fcdo-travel-advisory', name: 'UK FCDO country travel advice', url: 'https://www.gov.uk/api/content/foreign-travel-advice', licence: 'Open Government Licence v3.0 (except stated third-party material)', commercialUse: 'yes', termsUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', attribution: 'Contains public sector information licensed under the Open Government Licence v3.0. UK Foreign, Commonwealth & Development Office.', rateLimits: 'Application cache 1 hour/country; source limits apply', keyNeeded: false, language: 'en', region: 'Country selected by analyst', kind: 'travel_advisory', format: 'govuk' },
];
type Raw = { payload: unknown; fetchedAt: string; mode: 'fresh' | 'stale'; staleSince: string | null };
const caches = new Map<string, ResilientFeed<unknown>>();
const parser = new Parser();
const text = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
const iso = (value: unknown) => { const time = typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : NaN; return Number.isFinite(time) ? new Date(time).toISOString() : undefined; };
function row(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 28);

export function normalizeSpecialist(source: SpecialistSource, raw: Raw, limit: number): NormalizedIntelligenceEvent[] {
  let records: Record<string, unknown>[] = [];
  if (source.format === 'nws') records = (Array.isArray(row(raw.payload).features) ? row(raw.payload).features as unknown[] : []).map(value => ({ ...row(row(value).properties), geometry: row(value).geometry }));
  else if (source.format === 'rss') records = Array.isArray(raw.payload) ? raw.payload.map(row) : [];
  else records = [row(raw.payload)];
  return records.slice(0, limit).flatMap(record => {
    const title = text(record.headline || record.title || record.event).slice(0, 1000);
    if (!title) return [];
    const countryPage = source.format === 'govuk' && typeof record.base_path === 'string' && /^\/foreign-travel-advice\/[a-z-]+$/.test(record.base_path) ? `https://www.gov.uk${record.base_path}` : undefined;
    const sourceUrl = safeSourceUrl(record.web_url || record.link || countryPage || record['@id']) || source.url;
    const reportedPublished = iso(record.sent || record.public_updated_at || record.isoDate || record.pubDate);
    const publicationAnomaly = reportedPublished && Date.parse(reportedPublished) > Date.parse(raw.fetchedAt) + 300000 ? 'Source publication date is later than retrieval time; excluded from chronological ranking.' : undefined;
    const published = publicationAnomaly ? undefined : reportedPublished;
    const id = hash(`${source.id}:${record.id || record.guid || sourceUrl}:${published || title}`);
    const geometry = row(record.geometry);
    const coordinates = geometry.type === 'Point' && Array.isArray(geometry.coordinates) ? geometry.coordinates as number[] : null;
    const reported = coordinates && coordinates.length >= 2 && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]) && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90;
    const severity = source.format === 'nws' ? ({ Extreme: 100, Severe: 75, Moderate: 50, Minor: 25 }[String(record.severity)] ?? 0) : 0;
    return [{ externalId: `${source.id}:${id}`, providerId: source.id, organizationScope: null,
      pack: source.kind === 'health_notice' || source.kind === 'travel_advisory' ? 'osint_news' : 'weather_disaster', eventType: source.kind,
      title, summary: text(record.description || record.contentSnippet || record.summary || record.headline || record.title).slice(0, 2000) || title,
      entities: [], location: reported ? { latitude: coordinates![1], longitude: coordinates![0] } : { label: text(record.areaDesc) || source.region },
      ...(published ? { startedAt: published } : {}), ...(iso(record.expires) ? { expectedEndAt: iso(record.expires) } : {}),
      severity, confidence: 100, verificationState: 'confirmed',
      sources: [{ id: source.id, name: source.name, url: sourceUrl, sourceType: 'primary_authority', ...(published ? { publishedAt: published } : {}), retrievedAt: raw.fetchedAt }],
      rawEvidenceRefs: [{ providerRecordId: String(record.id || record.guid || id), sourceUrl }], deduplicationKey: `${source.id}:${id}`,
      attributes: { originalLanguage: source.language, sourceRegion: source.region, reportedPublishedAt: reportedPublished ?? null, publicationAnomaly: publicationAnomaly ?? null, licence: source.licence, commercialUse: source.commercialUse, attribution: source.attribution, termsUrl: source.termsUrl,
        updateMode: 'polling', intervalSeconds: source.format === 'govuk' ? 3600 : source.kind === 'health_notice' ? 900 : 300,
        dataMode: raw.mode, staleSince: raw.staleSince, severityMethod: source.format === 'nws' ? 'Official NWS category mapping: Extreme 100, Severe 75, Moderate 50, Minor 25, unknown 0' : 'No numeric severity assigned',
        sourceTextStatus: 'Official publication; publication does not independently verify every underlying claim',
      },
    } satisfies NormalizedIntelligenceEvent];
  });
}

function provider(source: SpecialistSource): IntelligenceEventProvider<Raw> {
  return { id: source.id, name: source.name, sourceId: source.id, pack: source.kind === 'health_notice' || source.kind === 'travel_advisory' ? 'osint_news' : 'weather_disaster',
    costType: 'free', mode: 'FREE', supportedEventTypes: [source.kind], requiresCredentials: source.keyNeeded, timeoutMs: 12000, queryOnly: source.format === 'govuk',
    compliance: () => ({ license: source.licence, commercialUse: source.commercialUse, attribution: source.attribution, rateLimits: source.rateLimits, termsUrl: source.termsUrl }),
    isConfigured: () => source.commercialUse === 'yes',
    async fetch(context) {
      const country = context.parameters?.country;
      if (source.format === 'govuk' && (!country || !/^[a-z][a-z-]{1,69}$/.test(country))) throw new Error('Select a GOV.UK country slug, for example united-arab-emirates.');
      const cacheKey = source.id + (country ? `:${country}` : '');
      let cache = caches.get(source.id);
      if (!cache) { cache = new ResilientFeed({ ttlMs: source.format === 'govuk' ? 3600000 : source.kind === 'health_notice' ? 900000 : 300000, retries: 0 }); caches.set(source.id, cache); }
      const result = await cache.load(cacheKey, async signal => {
        const response = await fetch(source.url + (source.format === 'govuk' ? `/${country}` : ''), { signal: AbortSignal.any([signal, context.signal]), redirect: 'error', headers: { Accept: 'application/json, application/xml, text/xml', 'User-Agent': 'Ophanim/1.0 public safety feed' }, cache: 'no-store' });
        if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
        const reader = response.body?.getReader(); if (!reader) throw new Error('Empty source response.');
        let size = 0; const chunks: Uint8Array[] = [];
        for (;;) { const value = await reader.read(); if (value.done) break; size += value.value.byteLength; if (size > 4000000) { await reader.cancel(); throw new Error('Source response exceeds size limit.'); } chunks.push(value.value); }
        const body = Buffer.concat(chunks).toString('utf8');
        if (source.format === 'rss') return (await parser.parseString(body)).items;
        return JSON.parse(body);
      });
      if (result.data === null || !result.observation.lastSuccessAt) throw new Error('Source unavailable; no recorded snapshot.');
      return { payload: result.data, fetchedAt: result.observation.lastSuccessAt, mode: result.mode === 'fresh' ? 'fresh' : 'stale', staleSince: result.staleSince };
    },
    normalize: (raw, context) => normalizeSpecialist(source, raw, context.limit),
  };
}
export const specialistEventProviders = SPECIALIST_SOURCES.map(provider);
