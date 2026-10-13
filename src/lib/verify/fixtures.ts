import type { NormalizedIntelligenceEvent } from '@/lib/intelligence/event-provider';
import { parseClaimText } from './claim';
import type { ParsedClaim } from './types';

export const REPLAY_TIME = '2026-10-09T08:00:00.000Z';
const observed = '2026-10-09T07:30:00.000Z';
function event(id: string, type: string, summary: string, latitude: number, longitude: number, attributes: Record<string, unknown> = {}): NormalizedIntelligenceEvent {
  return { externalId: id, providerId: 'verify-observations', organizationScope: null, pack: 'osint_news', eventType: type,
    title: `Synthetic fixture: ${type}`, summary, entities: [], location: { latitude, longitude }, startedAt: observed,
    severity: 0, confidence: 100, verificationState: 'confirmed', sources: [{ id: `fixture-${id}`, name: `Synthetic ${id} fixture`, sourceType: 'primary_authority', publishedAt: observed, retrievedAt: REPLAY_TIME }],
    rawEvidenceRefs: [{ providerRecordId: id }], deduplicationKey: id, attributes };
}
type Fixture = { id: string; label: string; claim: ParsedClaim; events: NormalizedIntelligenceEvent[]; missing?: string[] };
function claim(text: string) { return parseClaimText(text, new Date(REPLAY_TIME)); }
export const VERIFY_FIXTURES: Fixture[] = [
  { id: 'dubai-fog', label: 'Dubai airport fog', claim: claim('Dubai airport is closed'), events: [
    event('metar', 'airport_weather', 'OMDB: fog with 0.3 statute mile visibility. This is weather evidence, not a closure notice.', 25.2532, 55.3657, { airportCode: 'OMDB', fog: true, lowVisibility: true }),
    event('diversions', 'airport_diversions', 'Two flights diverted during the last hour.', 25.2532, 55.3657, { airportCode: 'OMDB', diversions: 2 }),
    event('movements', 'airport_movements', 'Movements log.', 25.2532, 55.3657, { airportCode: 'OMDB', departures: 12, intervalStart: '2026-10-09T07:00:00Z', intervalEnd: REPLAY_TIME }),
  ] },
  { id: 'earthquake', label: 'Tokyo earthquake', claim: claim('Magnitude 5.6 earthquake hit Tokyo'), events: [event('usgs', 'earthquake', 'Synthetic USGS-shaped observation: magnitude 5.6 near Tokyo at 07:30 UTC.', 35.6762, 139.6503, { magnitude: 5.6 })] },
  { id: 'red-sea', label: 'Red Sea ship claim', claim: { ...claim('Ship DEMO VESSEL was seized in the Red Sea'), entities: ['DEMO VESSEL'] }, events: [event('ais-gap', 'ais_gap', 'An AIS observation is missing; this does not establish an attack or seizure.', 20, 38)], missing: ['UKMTO advisories and independent official incident statements'] },
  { id: 'sanctions', label: 'Sanctions listing', claim: { ...claim('Company DEMO SHIPPING is sanctioned'), entities: ['DEMO SHIPPING'] }, events: [{ ...event('sanctions', 'sanctions_update', 'DEMO SHIPPING appears on the synthetic demonstration list.', 0, 0, { listName: 'Synthetic demo list (not a real sanctions list)', listDate: '2026-10-09', listed: true }), entities: [{ type: 'company', value: 'DEMO SHIPPING' }] }] },
  { id: 'opinion', label: 'Uncheckable opinion', claim: claim('I believe tomorrow will be a better day'), events: [] },
];
