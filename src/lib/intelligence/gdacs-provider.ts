import { ResilientFeed } from '@/lib/providers/resilient-feed';
import type { IntelligenceEventProvider, NormalizedIntelligenceEvent } from './event-provider';
const URL = 'https://www.gdacs.org/gdacsapi/api/Events/geteventlist/EVENTS4APP';
const cache = new ResilientFeed<unknown>({ ttlMs: 360000, retries: 0 });
const row = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').slice(0, 2000) : '';
export const GDACS_LICENCE = { license: 'GDACS specific terms; commercial reuse unresolved', commercialUse: 'unknown' as const, attribution: 'Global Disaster Alert and Coordination System, GDACS. Automatic impact estimates require independent validation.', rateLimits: 'Disabled by licence; proposed cache 360 seconds, matching published feed cadence', termsUrl: 'https://www.gdacs.org/About/termofuse.aspx' };
const families: Record<string, string> = { EQ: 'earthquake', TC: 'severe_storm', FL: 'flood', VO: 'volcanic_activity', WF: 'wildfire', DR: 'drought' };
export function normalizeGdacs(payload: unknown, fetchedAt: string, limit = 100): NormalizedIntelligenceEvent[] {
  const features = row(payload).features;
  return (Array.isArray(features) ? features : []).slice(0, limit).flatMap(value => {
    const feature = row(value), properties = row(feature.properties), geometry = row(feature.geometry);
    const id = String(properties.eventid ?? feature.id ?? ''), family = families[String(properties.eventtype ?? '')];
    if (!id || !family) return [];
    const coordinates = geometry.type === 'Point' && Array.isArray(geometry.coordinates) ? geometry.coordinates : null;
    const validPoint = coordinates && typeof coordinates[0] === 'number' && Number.isFinite(coordinates[0]) && Math.abs(coordinates[0]) <= 180 && typeof coordinates[1] === 'number' && Number.isFinite(coordinates[1]) && Math.abs(coordinates[1]) <= 90;
    const reported = typeof properties.fromdate === 'string' && Number.isFinite(Date.parse(properties.fromdate)) ? new Date(properties.fromdate).toISOString() : undefined;
    const startedAt = reported && Date.parse(reported) <= Date.parse(fetchedAt) + 300000 ? reported : undefined;
    const title = text(properties.name || properties.title) || `GDACS ${family.replaceAll('_', ' ')} ${id}`;
    const sourceUrl = `https://www.gdacs.org/report.aspx?eventtype=${encodeURIComponent(String(properties.eventtype))}&eventid=${encodeURIComponent(id)}`;
    const severity = ({ green: 25, orange: 60, red: 90 }[String(properties.alertlevel).toLowerCase()] ?? 0);
    return [{ externalId: `gdacs:${properties.eventtype}:${id}`, providerId: 'gdacs-hazards', organizationScope: null, pack: 'weather_disaster', eventType: family,
      title, summary: text(properties.description) || title, entities: [], location: validPoint ? { longitude: coordinates![0], latitude: coordinates![1] } : { label: title }, ...(startedAt ? { startedAt } : {}),
      severity, confidence: 0, verificationState: 'unverified', sources: [{ id: 'gdacs-hazards', name: 'GDACS automatic hazard assessment', url: sourceUrl, sourceType: 'primary_authority', ...(startedAt ? { publishedAt: startedAt } : {}), retrievedAt: fetchedAt }],
      rawEvidenceRefs: [{ providerRecordId: id, sourceUrl }], deduplicationKey: `gdacs:${properties.eventtype}:${id}`,
      attributes: { licence: GDACS_LICENCE.license, commercialUse: GDACS_LICENCE.commercialUse, attribution: GDACS_LICENCE.attribution, reportedStartedAt: reported ?? null, sourceAlertLevel: text(properties.alertlevel), confidenceMethod: 'No numerical confidence assigned', severityMethod: 'GDACS model category mapping for display: green 25, orange 60, red 90; not an official warning or validated risk index.' },
    } satisfies NormalizedIntelligenceEvent];
  });
}
export const gdacsHazardProvider: IntelligenceEventProvider<{ payload: unknown; fetchedAt: string; mode: string; staleSince: string | null }> = {
  id: 'gdacs-hazards', name: 'GDACS normalized hazards (licence review pending)', sourceId: 'gdacs-hazards', pack: 'weather_disaster', mode: 'FREE', costType: 'free', supportedEventTypes: Object.values(families), requiresCredentials: false, timeoutMs: 10000,
  compliance: () => GDACS_LICENCE, isConfigured: () => false,
  async fetch(context) {
    if (!gdacsHazardProvider.isConfigured()) throw new Error('Disabled by licence: commercial reuse review is unresolved.');
    const result = await cache.load('gdacs-hazards', async signal => {
      const response = await fetch(URL, { signal: AbortSignal.any([signal, context.signal]), redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
      const reader = response.body?.getReader(); if (!reader) throw new Error('Empty response.'); let size = 0; const chunks: Uint8Array[] = [];
      for (;;) { const value = await reader.read(); if (value.done) break; size += value.value.byteLength; if (size > 4000000) { await reader.cancel(); throw new Error('Response exceeds size limit.'); } chunks.push(value.value); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    });
    if (result.data === null || !result.observation.lastSuccessAt) throw new Error('Source unavailable.');
    return { payload: result.data, fetchedAt: result.observation.lastSuccessAt, mode: result.mode, staleSince: result.staleSince };
  },
  normalize: (raw, context) => normalizeGdacs(raw.payload, raw.fetchedAt, context.limit).map(event => ({ ...event, attributes: { ...event.attributes, dataMode: raw.mode, staleSince: raw.staleSince } })),
};
