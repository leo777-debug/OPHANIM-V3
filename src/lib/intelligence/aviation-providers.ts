import { createHash } from 'node:crypto';
import { parseDocument, DomUtils } from 'htmlparser2';
import { INTEGRATIONS } from '@/lib/integrations/catalog';
import { ResilientFeed } from '@/lib/providers/resilient-feed';
import { isRateLimited } from '@/lib/ssrf-guard';
import type { IntelligenceEventProvider, NormalizedIntelligenceEvent } from './event-provider';

const row = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 4000) => typeof value === 'string' ? value.slice(0, limit) : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
function iso(value: unknown) {
  const time = typeof value === 'number' && value > 0 ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN;
  const date = new Date(time); return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
const metadata = (id: string) => INTEGRATIONS.find(service => service.id === id)!;
const compliance = (id: string) => { const rights = metadata(id).licence!; return { ...rights, license: rights.name }; };
export const AVIATION_SOURCES = ['faa-public-status', 'awc-us-weather'].map(id => ({ ...metadata(id), keyNeeded: false }));
export function parseUsStations(value = 'KJFK,KLAX,KORD') {
  const stations = [...new Set(value.toUpperCase().split(',').map(station => station.trim()).filter(Boolean))].sort();
  if (!stations.length || stations.length > 20 || stations.some(station => !/^K[A-Z0-9]{3}$/.test(station))) throw new Error('Select 1–20 continental-US K-station ICAO codes. International reports require the separate rights-reviewed connector.');
  return stations;
}
export function visibilityMiles(value: unknown): number | null {
  if (typeof value === 'number') return value >= 0 && Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/^[MP]/, '').replace(/\+$/, '');
  const fraction = cleaned.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  const result = fraction ? Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3]) : /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
  return Number.isFinite(result) && result >= 0 ? result : null;
}
export function weatherWatch(value: unknown) {
  const input = row(value), visibility = visibilityMiles(input.visib);
  const winds = [number(input.wgst), number(input.wspd)].filter((value): value is number => value !== null && value >= 0), wind = winds.length ? Math.max(...winds) : null;
  const ceilings = (Array.isArray(input.clouds) ? input.clouds : []).flatMap(value => { const cloud = row(value), base = number(cloud.base); return ['BKN', 'OVC', 'VV'].includes(String(cloud.cover)) && base !== null && base >= 0 ? [base] : []; });
  const vertical = number(input.vertVis); if (vertical !== null && vertical >= 0) ceilings.push(vertical);
  const ceiling = ceilings.length ? Math.min(...ceilings) : null;
  const sourceCategory = ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(String(input.fltCat)) ? String(input.fltCat) : null;
  let score = sourceCategory ? ({ VFR: 0, MVFR: 40, IFR: 70, LIFR: 90 }[sourceCategory] ?? 0) : 0;
  const reasons: string[] = [];
  if (sourceCategory) reasons.push(`Source flight category ${sourceCategory}`);
  if (visibility !== null && visibility < 1 || ceiling !== null && ceiling < 500) { score = Math.max(score, 90); reasons.push('Visibility <1 statute mile or ceiling <500 ft'); }
  else if (visibility !== null && visibility < 3 || ceiling !== null && ceiling < 1000) { score = Math.max(score, 70); reasons.push('Visibility <3 statute miles or ceiling <1,000 ft'); }
  else if (visibility !== null && visibility <= 5 || ceiling !== null && ceiling <= 3000) { score = Math.max(score, 40); reasons.push('Visibility ≤5 statute miles or ceiling ≤3,000 ft'); }
  if (wind !== null && wind >= 50) { score = Math.max(score, 85); reasons.push('Wind/gust ≥50 knots'); }
  else if (wind !== null && wind >= 35) { score = Math.max(score, 60); reasons.push('Wind/gust ≥35 knots'); }
  if (/TS|FZRA/.test(text(input.wxString))) { score = Math.max(score, 70); reasons.push('Thunderstorm or freezing-rain weather code'); }
  const classified = sourceCategory !== null || visibility !== null || ceiling !== null || wind !== null || text(input.wxString).length > 0;
  return { score: classified ? score : null, reasons: reasons.length ? reasons : [classified ? 'No configured watch threshold exceeded; this does not establish safe operation.' : 'Insufficient fields for a threshold classification.'], visibilityMiles: visibility, originalVisibility: input.visib ?? null, ceilingFt: ceiling, windKnots: wind, sourceCategory,
    method: 'Ophanim display watch, not an official airport restriction or flight-planning decision. Maximum of source category mapping and visibility/ceiling/wind/weather thresholds; 0 means no configured threshold exceeded, not safe.' };
}
type Raw = { payload: unknown; fetchedAt: string; dataMode: string; staleSince: string | null };
async function boundedBody(response: Response) {
  const reader = response.body?.getReader(); if (!reader) return ''; let size = 0; const chunks: Uint8Array[] = [];
  for (;;) { const value = await reader.read(); if (value.done) break; size += value.value.byteLength; if (size > 4000000) { await reader.cancel(); throw new Error('Source response exceeds size limit.'); } chunks.push(value.value); }
  return Buffer.concat(chunks).toString('utf8');
}
const faaCache = new ResilientFeed<string>({ ttlMs: 120000, retries: 0 });
export function normalizeFaaStatus(xml: string, raw: Omit<Raw, 'payload'>): NormalizedIntelligenceEvent[] {
  // htmlparser2 does not fetch external DTDs/entities. Only public status facts are emitted.
  const document = parseDocument(xml, { xmlMode: true, decodeEntities: true });
  const nodes = (name: string, parents = document.children) => DomUtils.findAll(element => element.name === name, parents);
  const updateNode = nodes('Update_Time')[0], updated = updateNode ? iso(DomUtils.textContent(updateNode)) : null;
  const result: NormalizedIntelligenceEvent[] = [];
  for (const group of nodes('Delay_type')) {
    const category = DomUtils.textContent(nodes('Name', group.children)[0] ?? group).trim().slice(0, 150);
    const kind = /closure/i.test(category) ? 'airport_closure_notice' : /ground stop/i.test(category) ? 'airport_ground_stop' : /ground delay/i.test(category) ? 'airport_ground_delay' : 'airport_delay_notice';
    for (const codeNode of nodes('ARPT', group.children)) {
      const code = DomUtils.textContent(codeNode).trim(); if (!/^[A-Z0-9]{3,5}$/.test(code) || !codeNode.parent || !('children' in codeNode.parent)) continue;
      const children = codeNode.parent.children;
      const field = (name: string, roots = children) => { const node = nodes(name, roots)[0]; return node ? DomUtils.textContent(node).trim().slice(0, 500) : ''; };
      const start = field('Start'), reopen = field('Reopen') || field('End_Time'), reason = field('Reason');
      const id = createHash('sha256').update(`${category}:${code}:${start}:${reopen}:${reason}`).digest('hex').slice(0, 24);
      const description = kind === 'airport_closure_notice' ? 'The FAA public list includes a closure/restriction notice. This can be conditional or scheduled; full airport closure is not established. Read the original notice for exceptions and scope.' : `The FAA public list includes ${category.toLowerCase()}. Read the current official status for scope, duration and exceptions.`;
      const delayDetails = nodes('Arrival_Departure', children).map(detail => ({ direction: text(detail.attribs.Type || detail.attribs.type, 80), minimum: field('Min', detail.children) || null, maximum: field('Max', detail.children) || null, trend: field('Trend', detail.children) || null }));
      result.push({ externalId: `faa-status:${id}`, providerId: 'faa-public-status', organizationScope: null, pack: 'weather_disaster', eventType: kind, title: `${code} · ${kind.replaceAll('_', ' ')}`, summary: description, entities: [{ type: 'location', value: code, label: `FAA airport code ${code}` }], location: { label: `FAA airport ${code}` }, severity: kind === 'airport_ground_stop' ? 80 : kind === 'airport_closure_notice' ? 70 : kind === 'airport_ground_delay' ? 60 : 40, confidence: 0, verificationState: 'unverified',
        sources: [{ id: 'faa-public-status', name: 'FAA public NAS status', sourceType: 'primary_authority', url: 'https://nasstatus.faa.gov/', retrievedAt: raw.fetchedAt }], rawEvidenceRefs: [{ providerRecordId: id, sourceUrl: 'https://nasstatus.faa.gov/' }], deduplicationKey: `faa-status:${id}`,
        attributes: { dataMode: raw.dataMode, fetchedAt: raw.fetchedAt, staleSince: raw.staleSince, sourceCategory: category, airportCode: code, sourceUpdatedAt: updated, startText: start || null, reopenText: reopen || null, minimumDelayText: field('Min') || field('Min_Delay') || null, averageDelayText: field('Avg') || field('Avg_Delay') || null, maximumDelayText: field('Max') || field('Max_Delay') || null, delayDetails, conditionsMentioned: /\bEXC\b|\bPPR\b|DLY|TO NON SKED/i.test(reason), rawNoticeTextRepublished: false, attribution: compliance('faa-public-status').attribution, severityMethod: 'Display category ranking: ground stop 80, closure/restriction notice 70, ground delay programme 60, other delay notice 40. Not validated disruption severity. Notice issue/onset time unknown unless stated in original; source update is separate.' },
      });
      if (result.length >= 200) return result;
    }
  }
  return result;
}
export const faaStatusProvider: IntelligenceEventProvider<Raw> = {
  id: 'faa-public-status', name: 'FAA public NAS airport status', sourceId: 'faa-public-status', pack: 'weather_disaster', costType: 'free', mode: 'FREE', supportedEventTypes: ['airport_closure_notice', 'airport_ground_stop', 'airport_ground_delay', 'airport_delay_notice'], requiresCredentials: false, timeoutMs: 10000,
  isConfigured: () => true, compliance: () => compliance('faa-public-status'),
  async fetch(context) {
    const result = await faaCache.load('national-status', async signal => { const response = await fetch(metadata('faa-public-status').probe!, { signal: AbortSignal.any([signal, context.signal]), redirect: 'error', headers: { 'User-Agent': 'Ophanim/1.0 public disruption awareness', Accept: 'application/xml' }, cache: 'no-store' }); if (!response.ok) throw new Error(`FAA HTTP ${response.status}`); const body = await boundedBody(response); if (!body.includes('<AIRPORT_STATUS_INFORMATION')) throw new Error('Unexpected FAA status response.'); return body; });
    if (result.data === null || !result.observation.lastSuccessAt) throw new Error('FAA status unavailable; no last-good response.');
    return { payload: result.data, fetchedAt: result.observation.lastSuccessAt, dataMode: result.mode, staleSince: result.staleSince };
  }, normalize: (raw, context) => normalizeFaaStatus(String(raw.payload), raw).slice(0, context.limit),
};
let awcQueue = Promise.resolve(), lastAwcRequest = 0;
const metarCache = new ResilientFeed<unknown>({ ttlMs: 300000, retries: 0 }), tafCache = new ResilientFeed<unknown>({ ttlMs: 600000, retries: 0 });
async function fetchAwc(kind: 'metar' | 'taf', stations: string[], signal: AbortSignal) {
  const work = awcQueue.then(async () => {
    signal.throwIfAborted();
    if (isRateLimited('awc-us:upstream', 40)) throw new Error('AWC request budget reached; retry after source cache interval.');
    const wait = Math.max(0, 800 - (Date.now() - lastAwcRequest)); if (wait) await new Promise(resolve => setTimeout(resolve, wait)); signal.throwIfAborted(); lastAwcRequest = Date.now();
    const response = await fetch(`https://aviationweather.gov/api/data/${kind}?ids=${encodeURIComponent(stations.join(','))}&format=json`, { signal, redirect: 'error', headers: { 'User-Agent': 'Ophanim/1.0 public airport weather awareness', Accept: 'application/json' }, cache: 'no-store' });
    if (response.status === 204) return [];
    if (!response.ok) throw new Error(`AWC HTTP ${response.status}`);
    const parsed: unknown = JSON.parse(await boundedBody(response)); if (!Array.isArray(parsed)) throw new Error('Unexpected AWC response.'); return parsed;
  });
  awcQueue = work.then(() => {}, () => {}); return work;
}
export function normalizeAirportWeather(kind: 'metar' | 'taf', raw: Raw, requested: string[], assessedAt = Date.parse(raw.fetchedAt)): NormalizedIntelligenceEvent[] {
  const sourceId = `awc-us-${kind}`;
  return (Array.isArray(raw.payload) ? raw.payload : []).flatMap(value => {
    const report = row(value), station = text(report.icaoId, 4); if (!/^K[A-Z0-9]{3}$/.test(station) || !requested.includes(station)) return [];
    const published = kind === 'metar' ? iso(report.obsTime) || iso(report.reportTime) : iso(report.issueTime);
    const future = published !== null && Date.parse(published) > Date.parse(raw.fetchedAt) + 300000;
    const latitude = number(report.lat), longitude = number(report.lon), validPoint = latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    const forecast = kind === 'taf';
    const periods = forecast && Array.isArray(report.fcsts) ? report.fcsts.slice(0, 30).map(value => { const period = row(value); return { validFrom: iso(period.timeFrom), validTo: iso(period.timeTo), sourceProbability: number(period.probability), change: text(period.fcstChange, 20), watch: weatherWatch(period) }; }) : [];
    const datedPeriods = periods.filter(period => period.validFrom && period.validTo && Date.parse(period.validTo) > assessedAt);
    const watch = forecast ? { score: datedPeriods.some(period => period.watch.score !== null) ? Math.max(...datedPeriods.map(period => period.watch.score ?? 0)) : null, reasons: [datedPeriods.length ? 'Maximum watch threshold among unexpired dated forecast periods, not observed disruption.' : 'No unexpired dated forecast periods available for a watch classification.'] } : weatherWatch(report);
    if (future) { watch.score = null; watch.reasons = ['Source timestamp anomaly; current watch classification withheld.']; }
    const rawText = text(forecast ? report.rawTAF : report.rawOb);
    const id = createHash('sha256').update(`${station}:${kind}:${published ?? rawText}`).digest('hex').slice(0, 24);
    return [{ externalId: `${sourceId}:${id}`, providerId: sourceId, organizationScope: null, pack: 'weather_disaster', eventType: forecast ? 'airport_weather_forecast' : 'airport_weather_observation', title: `${station} · ${forecast ? 'TAF forecast' : 'METAR observation'}`, summary: rawText || 'No raw product text supplied.', entities: [{ type: 'location', value: station, label: `ICAO station ${station}` }], location: validPoint ? { latitude: latitude!, longitude: longitude!, label: station, countryCode: 'US' } : { label: station, countryCode: 'US' }, ...(published && !future ? { startedAt: published } : {}), ...(forecast && iso(report.validTimeTo) ? { expectedEndAt: iso(report.validTimeTo)! } : {}), severity: watch.score ?? 0, confidence: 0, verificationState: 'unverified',
      sources: [{ id: sourceId, name: 'NOAA/NWS Aviation Weather Center', url: `https://aviationweather.gov/data/metar/?ids=${station}&taf=on`, sourceType: 'primary_authority', ...(published && !future ? { publishedAt: published } : {}), retrievedAt: raw.fetchedAt }], rawEvidenceRefs: [{ providerRecordId: id, sourceUrl: 'https://aviationweather.gov/data/api/' }], deduplicationKey: `${sourceId}:${id}`,
      attributes: { dataMode: raw.dataMode, fetchedAt: raw.fetchedAt, staleSince: raw.staleSince, assessedAt: new Date(assessedAt).toISOString(), station, rawProduct: rawText, rawProductTruncated: String(forecast ? report.rawTAF ?? '' : report.rawOb ?? '').length > rawText.length, forecast, watch, periods, validFrom: forecast ? iso(report.validTimeFrom) : null, validTo: forecast ? iso(report.validTimeTo) : null, forecastExpired: forecast && iso(report.validTimeTo) ? Date.parse(iso(report.validTimeTo)!) <= assessedAt : null, reportedPublicationTime: published, timeAnomaly: future ? 'Source publication time is after retrieval; excluded from current observation chronology.' : null, observationOld: !forecast && published ? assessedAt - Date.parse(published) > 90 * 60000 : null, attribution: compliance('awc-us-weather').attribution, method: 'Source product text (truncation indicated if present) plus separately labelled Ophanim display thresholds; not flight planning, airport closure evidence or an operational decision.' },
    } satisfies NormalizedIntelligenceEvent];
  });
}
function weatherProvider(kind: 'metar' | 'taf'): IntelligenceEventProvider<Raw> {
  return { id: `awc-us-${kind}`, name: `NOAA US ${kind.toUpperCase()} airport weather`, sourceId: 'awc-us-weather', pack: 'weather_disaster', costType: 'free', mode: 'FREE', queryOnly: true, supportedEventTypes: [kind === 'taf' ? 'airport_weather_forecast' : 'airport_weather_observation'], requiresCredentials: false, timeoutMs: 12000, compliance: () => compliance('awc-us-weather'), isConfigured: () => true,
    async fetch(context) { const stations = parseUsStations(context.parameters?.stations), cache = kind === 'taf' ? tafCache : metarCache; const result = await cache.load(stations.join(','), signal => fetchAwc(kind, stations, AbortSignal.any([signal, context.signal]))); if (result.data === null || !result.observation.lastSuccessAt) throw new Error('Airport weather unavailable; no last-good response.'); return { payload: result.data, fetchedAt: result.observation.lastSuccessAt, dataMode: result.mode, staleSince: result.staleSince }; },
    normalize: (raw, context) => normalizeAirportWeather(kind, raw, parseUsStations(context.parameters?.stations), context.now.getTime()).slice(0, context.limit),
  };
}
export const aviationEventProviders = [faaStatusProvider, weatherProvider('metar'), weatherProvider('taf')];
