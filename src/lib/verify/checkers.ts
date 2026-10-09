import type { NormalizedIntelligenceEvent } from '@/lib/intelligence/event-provider';
import { safeSourceUrl } from '@/lib/intelligence/news';
import { VERIFY_CONFIG, type ParsedClaim, type VerifyEvidence, type Verdict, type TrustTier } from './types';

export const CHECKER_PROVIDERS: Record<ParsedClaim['type'], string[]> = {
  earthquake: ['usgs-earthquakes'], airport: ['verify-airport-weather', 'verify-observations'],
  storm: ['nasa-eonet', 'verify-observations'], wildfire: ['nasa-eonet', 'verify-observations'],
  maritime: ['verify-observations'], sanctions: ['official-sanctions-events', 'verify-observations'],
  news: ['verify-observations'], not_checkable: [],
};

function distance(a: number, b: number, c: number, d: number): number {
  const radians = Math.PI / 180;
  const h = Math.sin((c - a) * radians / 2) ** 2 + Math.cos(a * radians) * Math.cos(c * radians) * Math.sin((d - b) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function matchesPlace(claim: ParsedClaim, event: NormalizedIntelligenceEvent): boolean {
  if (claim.type === 'airport') return Boolean(claim.place.code && event.attributes.airportCode === claim.place.code);
  if (claim.place.code && event.attributes.airportCode === claim.place.code) return true;
  return claim.place.latitude !== null && claim.place.longitude !== null
    && Number.isFinite(event.location.latitude) && Number.isFinite(event.location.longitude)
    && distance(claim.place.latitude, claim.place.longitude, event.location.latitude!, event.location.longitude!) <= VERIFY_CONFIG.radiusKm;
}

function stanceFor(claim: ParsedClaim, event: NormalizedIntelligenceEvent): { stance: VerifyEvidence['stance']; aspect: string; statement: string } | null {
  const attrs = event.providerId === 'official-sanctions-events' && event.attributes.upstream && typeof event.attributes.upstream === 'object'
    ? event.attributes.upstream as Record<string, unknown> : event.attributes;
  if (claim.type === 'earthquake' && event.eventType === 'earthquake') {
    const magnitude = Number(attrs.magnitude);
    if (!Number.isFinite(magnitude) || magnitude < claim.minimumMagnitude) return null;
    return { stance: 'supports', aspect: 'earthquake', statement: event.summary };
  }
  if (claim.type === 'airport') {
    if (event.eventType === 'airport_weather') {
      return { stance: attrs.fog === true || attrs.lowVisibility === true ? 'supports' : 'neutral', aspect: 'weather_disruption', statement: event.summary };
    }
    if (event.eventType === 'airport_movements' && attrs.airportCode === claim.place.code && Number.isInteger(attrs.departures) && Number(attrs.departures) > 0
      && Number.isFinite(Date.parse(String(attrs.intervalStart))) && Number.isFinite(Date.parse(String(attrs.intervalEnd)))
      && Date.parse(String(attrs.intervalStart)) <= Date.parse(String(attrs.intervalEnd))
      && Date.parse(String(attrs.intervalStart)) >= Date.parse(claim.start) && Date.parse(String(attrs.intervalEnd)) <= Date.parse(claim.end)) {
      return { stance: claim.expectedObservation === 'airport_closed' ? 'contradicts' : 'neutral', aspect: 'airport_closed', statement: `${attrs.departures} recorded departures in the reported interval; this contradicts a total closure during that interval.` };
    }
    if (event.eventType === 'airport_diversions' && attrs.airportCode === claim.place.code && Number(attrs.diversions) > 0) return { stance: 'supports', aspect: 'flight_disruption', statement: event.summary };
    if (event.eventType === 'airport_closure' && attrs.airportCode === claim.place.code && attrs.closed === true) return { stance: 'supports', aspect: 'airport_closed', statement: event.summary };
    if (event.eventType === 'airport_closure' && attrs.airportCode === claim.place.code && attrs.closed === false) return { stance: claim.expectedObservation === 'airport_closed' ? 'contradicts' : 'neutral', aspect: 'airport_closed', statement: event.summary };
  }
  if (claim.type === 'storm' && ['severe_storm', 'tropical_cyclone', 'flood'].includes(event.eventType)
    && claim.expectedObservation === event.eventType) {
    return { stance: 'supports', aspect: event.eventType, statement: event.summary };
  }
  if (claim.type === 'wildfire' && event.eventType === 'wildfire') return { stance: 'supports', aspect: 'wildfire', statement: event.summary };
  if (claim.type === 'maritime' && event.eventType === claim.expectedObservation && attrs.officialStatus === true) {
    if (!claim.entities.length || !claim.entities.some((entity) => event.entities.some((candidate) => candidate.value.toLowerCase() === entity.toLowerCase()))) return null;
    return { stance: 'supports', aspect: event.eventType, statement: event.summary };
  }
  if (claim.type === 'sanctions' && typeof attrs.listName === 'string' && Number.isFinite(Date.parse(String(attrs.listDate))) && typeof attrs.listed === 'boolean'
    && claim.entities.some((entity) => event.entities.some((candidate) => candidate.value.toLowerCase() === entity.toLowerCase()))) {
    return { stance: attrs.listed ? 'supports' : 'neutral', aspect: 'sanctions', statement: `${event.summary} List: ${attrs.listName}; list date: ${attrs.listDate}. A missing listing alone is not proof of no sanctions.` };
  }
  if (claim.type === 'news' && attrs.claimObservation === claim.expectedObservation && attrs.explicitConfirmation === true) {
    return { stance: 'supports', aspect: claim.expectedObservation, statement: event.summary };
  }
  return null;
}

export function checkEvents(claim: ParsedClaim, events: NormalizedIntelligenceEvent[]): VerifyEvidence[] {
  const evidence: VerifyEvidence[] = [];
  for (const event of events) {
    if (event.organizationScope !== null) continue;
    const time = Date.parse(event.startedAt ?? '');
    if (!Number.isFinite(time) || time < Date.parse(claim.start) || time > Date.parse(claim.end)) continue;
    if (claim.type !== 'sanctions' && !matchesPlace(claim, event)) continue;
    const observation = stanceFor(claim, event);
    if (!observation) continue;
    for (const source of event.sources) {
      const override = event.attributes.trustTier;
      const trust: TrustTier = source.sourceType === 'primary_authority' || source.sourceType === 'direct_operator' ? 'official'
        : override === 'wire' ? 'wire' : source.sourceType === 'trusted_news' ? 'established_media' : 'social';
      if (claim.type === 'news' && trust === 'social') continue;
      const observedAt = source.publishedAt ?? event.startedAt!;
      const sourceTime = Date.parse(observedAt);
      if (!Number.isFinite(sourceTime) || !Number.isFinite(Date.parse(source.retrievedAt))) continue;
      evidence.push({ id: `${event.externalId}:${source.id}`, source: source.name, sourceUrl: safeSourceUrl(source.url),
        independenceKey: event.attributes.independenceKeys && typeof event.attributes.independenceKeys === 'object'
          ? String((event.attributes.independenceKeys as Record<string, unknown>)[source.id] ?? 'independence-not-reviewed') : source.id,
        trust, observedAt, fetchedAt: source.retrievedAt,
        ...observation, statement: observation.statement.slice(0, VERIFY_CONFIG.maxQuoteLength) });
    }
  }
  return evidence.slice(0, VERIFY_CONFIG.maximumEvidence);
}

export function verdictFor(claim: ParsedClaim, evidence: VerifyEvidence[]): Verdict {
  if (claim.type === 'not_checkable') return 'NOT CHECKABLE';
  const credible = evidence.filter((item) => ['official', 'wire', 'established_media'].includes(item.trust));
  const supports = credible.filter((item) => item.stance === 'supports');
  const contradicts = credible.filter((item) => item.stance === 'contradicts');
  if (supports.length && contradicts.length) return 'PARTLY TRUE';
  if (contradicts.length) return 'DATA SAYS OTHERWISE';
  const direct = supports.filter((item) => claim.type !== 'airport' || (claim.expectedObservation === 'airport_closed'
    ? item.aspect === 'airport_closed' : ['airport_closed', 'flight_disruption'].includes(item.aspect)));
  if (direct.some((item) => item.trust === 'official') || new Set(direct.map((item) => item.independenceKey)).size >= VERIFY_CONFIG.trustedPublisherCount) return 'CONFIRMED';
  return 'NOT CONFIRMED YET';
}

export function verdictSummary(claim: ParsedClaim, verdict: Verdict, evidence: VerifyEvidence[]): string {
  if (verdict === 'NOT CHECKABLE') return "This can't be checked with data. Ophanim checks observable public events, not opinions, predictions or motives.";
  if (verdict === 'PARTLY TRUE') return `Supported: ${[...new Set(evidence.filter((item) => item.stance === 'supports').map((item) => item.aspect))].join(', ')}. Contradicted: ${[...new Set(evidence.filter((item) => item.stance === 'contradicts').map((item) => item.aspect))].join(', ')}. See the source times and statements below.`;
  if (verdict === 'CONFIRMED') return `Source evidence supports the ${claim.type} claim within the selected time and place. No credible contradiction was returned by the checked sources.`;
  if (verdict === 'DATA SAYS OTHERWISE') return 'Credible observations contradict the claim in the checked interval. See the evidence and coverage limitations.';
  return 'The available evidence does not confirm this claim yet. Missing sources or empty results are not proof that it did not happen.';
}
