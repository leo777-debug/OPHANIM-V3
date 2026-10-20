import type { NormalizedIntelligenceEvent } from './event-provider';

export const PUBLIC_SNAPSHOT_CACHE = 'ophanim-public-snapshot-v1';
export const PUBLIC_SNAPSHOT_PATH = '/_ophanim_offline/public-advisories';
const providers = new Set(['noaa-public-warnings', 'nhc-atlantic', 'nhc-pacific', 'nhc-atlantic-es', 'cdc-travel-health', 'fcdo-travel-advisory']);
const hosts = new Set(['api.weather.gov', 'www.weather.gov', 'www.nhc.noaa.gov', 'wwwnc.cdc.gov', 'www.gov.uk']);
const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.slice(0, limit) : '';
function publicLink(value: unknown) {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && hosts.has(url.hostname) && !url.username && !url.password && !url.port ? url.href : ''; } catch { return ''; }
}
function date(value: unknown) { const time = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(time) ? new Date(time).toISOString() : null; }
export function makePublicSnapshot(events: NormalizedIntelligenceEvent[], checkedAt: string, now = new Date().toISOString()) {
  if (!date(now) || !date(checkedAt)) throw new Error('Snapshot requires recorded timestamps.');
  return { version: 1, savedAt: date(now), checkedAt: date(checkedAt), mode: 'offline snapshot; not current conditions',
    events: events.filter(event => event.organizationScope === null && providers.has(event.providerId)).slice(0, 150).map(event => ({
      title: clean(event.title, 500), summary: clean(event.summary, 2000), type: clean(event.eventType, 80), providerId: event.providerId,
      publishedAt: date(event.startedAt), retrievedAt: date(event.sources[0]?.retrievedAt), sourceName: clean(event.sources[0]?.name, 200),
      sourceUrl: publicLink(event.sources[0]?.url), attribution: clean(event.attributes.attribution, 1000), language: clean(event.attributes.originalLanguage, 20),
      dataMode: clean(event.attributes.dataMode, 40), publicationAnomaly: clean(event.attributes.publicationAnomaly, 500),
    })),
    limitation: 'At most 150 selected public advisory records. This saved view cannot establish present safety, source availability or complete regional coverage. Organization records are excluded.' };
}
export async function savePublicSnapshot(events: NormalizedIntelligenceEvent[], checkedAt: string) {
  if (!('caches' in globalThis)) throw new Error('Offline storage is unavailable in this browser. HTTPS is required.');
  const snapshot = makePublicSnapshot(events, checkedAt);
  const cache = await caches.open(PUBLIC_SNAPSHOT_CACHE);
  await cache.put(PUBLIC_SNAPSHOT_PATH, new Response(JSON.stringify(snapshot), { headers: { 'Content-Type': 'application/json' } }));
  return snapshot;
}
