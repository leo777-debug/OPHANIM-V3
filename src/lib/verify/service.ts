import { randomUUID } from 'node:crypto';
import { collectIntelligenceEvents } from '@/lib/intelligence/event-provider-registry';
import { CHECKER_PROVIDERS, checkEvents, verdictFor, verdictSummary } from './checkers';
import { VERIFY_FIXTURES, REPLAY_TIME } from './fixtures';
import { validateParsedClaim } from './claim';
import type { VerifyResult, ParsedClaim } from './types';

const limitations: Partial<Record<ParsedClaim['type'], string[]>> = {
  airport: ['Historical arrivals/departures, diversions and official closure notices unless a reviewed observations feed is configured', 'TAF forecasts (METAR only in this milestone)'],
  maritime: ['AIS position history and UKMTO advisories are not connected to this checker; an AIS gap never establishes a seizure'],
  storm: ['GDACS cyclone forecast tracks/cones are not connected to this checker'],
  wildfire: ['FIRMS satellite detections are not connected to this checker; NASA EONET is checked'],
  sanctions: ['An exact entity and dated list are required; absence from one list does not establish no sanctions'],
  news: ['No automatically trusted general news feed; configure licensed observations and server-side source trust tiers'],
};

export async function verifyClaim(value: unknown, options: { fixture?: string; previousId?: string } = {}, collect = collectIntelligenceEvents): Promise<VerifyResult> {
  const fixture = options.fixture ? VERIFY_FIXTURES.find((item) => item.id === options.fixture) : undefined;
  if (options.fixture && !fixture) throw new Error('Unknown replay fixture.');
  const claim = fixture ? fixture.claim : validateParsedClaim(value);
  const now = new Date();
  const ids = CHECKER_PROVIDERS[claim.type];
  // Never send an empty allowlist to the registry: empty means "all" there.
  const collected = fixture ? { events: fixture.events, diagnostics: [] } : ids.length ? await collect({ providerIds: ids, now, since: new Date(claim.start), parameters: { airportCode: claim.place.code ?? '' } }) : { events: [], diagnostics: [] };
  const evidence = checkEvents(claim, collected.events);
  const verdict = verdictFor(claim, evidence);
  const checked = fixture ? [...new Set(fixture.events.map((item) => item.title))] : collected.diagnostics.filter((item) => item.status === 'success').map((item) => `${item.providerId}: ${item.eventCount} observations received`);
  const couldNotCheck = fixture ? (fixture.missing ?? []).map((source) => ({ source, reason: 'Unavailable in this synthetic replay fixture.' })) : [
    ...collected.diagnostics.filter((item) => item.status !== 'success').map((item) => ({ source: item.providerId, reason: item.message ?? 'Source unavailable.' })),
    ...(limitations[claim.type] ?? []).map((source) => ({ source: 'Coverage limitation', reason: source })),
    ...(claim.type !== 'sanctions' && claim.type !== 'not_checkable' && claim.place.latitude === null && !claim.place.code ? [{ source: 'Place matching', reason: 'Place coordinates or a confirmed airport ICAO code are required.' }] : []),
    ...(claim.type === 'earthquake' ? [{ source: 'USGS coverage', reason: 'Existing provider covers magnitude 4.5+ in the last 24 hours only; earlier/smaller events cannot be checked here.' }] : []),
  ];
  return { id: randomUUID(), claim, verdict, summary: verdictSummary(claim, verdict, evidence), checkedAt: now.toISOString(), evidence, checked, couldNotCheck,
    mode: fixture ? 'replay' : 'live', ...(fixture ? { replay: { fixture: fixture.id, recordedAt: REPLAY_TIME, provenance: 'synthetic_test_fixture' as const } } : {}),
    ...(options.previousId ? { previousId: options.previousId } : {}) };
}
