import { describe, expect, it } from 'vitest';
import { VERIFY_FIXTURES, REPLAY_TIME } from './fixtures';
import { checkEvents, verdictFor } from './checkers';
import { parseClaimText, validateParsedClaim } from './claim';
import type { VerifyEvidence } from './types';

const fixture = (id: string) => VERIFY_FIXTURES.find((item) => item.id === id)!;
describe('Verify deterministic claims and evidence', () => {
  it.each([['dubai-fog', 'PARTLY TRUE'], ['earthquake', 'CONFIRMED'], ['red-sea', 'NOT CONFIRMED YET'], ['sanctions', 'CONFIRMED'], ['opinion', 'NOT CHECKABLE']])('%s replay returns %s', (id, verdict) => {
    const item = fixture(id); expect(verdictFor(item.claim, checkEvents(item.claim, item.events))).toBe(verdict);
  });
  it('does not call fog a closure', () => { const item = fixture('dubai-fog'); expect(verdictFor(item.claim, checkEvents(item.claim, item.events.slice(0, 1)))).toBe('NOT CONFIRMED YET'); });
  it('weather alone does not prove actual flight disruption', () => { const item = fixture('dubai-fog'); const claim = { ...item.claim, expectedObservation: 'flight_disruption' }; expect(verdictFor(claim, checkEvents(claim, item.events.slice(0, 1)))).toBe('NOT CONFIRMED YET'); });
  it('does not turn an airport attack into weather or confirm unsupported casualty details', () => {
    expect(parseClaimText('An explosion reported at Dubai airport').type).toBe('news');
    expect(parseClaimText('Earthquake in Tokyo killed 100 people').type).toBe('not_checkable');
  });
  it('movements contradict total closure only with a contained interval', () => {
    const item = fixture('dubai-fog'), movement = item.events[2];
    expect(verdictFor(item.claim, checkEvents(item.claim, [movement]))).toBe('DATA SAYS OTHERWISE');
    expect(checkEvents(item.claim, [{ ...movement, attributes: { ...movement.attributes, intervalStart: undefined } }])).toHaveLength(0);
    expect(checkEvents(item.claim, [{ ...movement, attributes: { ...movement.attributes, intervalEnd: '2026-10-10T00:00:00Z' } }])).toHaveLength(0);
  });
  it('does not treat absence or old observations as contradictory evidence', () => {
    const item = fixture('earthquake'); expect(checkEvents(item.claim, [{ ...item.events[0], startedAt: '2026-10-01T00:00:00Z' }])).toHaveLength(0);
    expect(verdictFor(item.claim, [])).toBe('NOT CONFIRMED YET');
  });
  it('never uses private organization events', () => { const item = fixture('earthquake'); expect(checkEvents(item.claim, [{ ...item.events[0], organizationScope: 'private' }])).toHaveLength(0); });
  it('requires exact airport code, not just a nearby airport', () => {
    const item = fixture('dubai-fog'); expect(checkEvents({ ...item.claim, place: { ...item.claim.place, code: 'OMDW' } }, item.events)).toHaveLength(0);
  });
  it('matches magnitude and never invents a small quake observation', () => {
    const item = fixture('earthquake'); expect(checkEvents({ ...item.claim, minimumMagnitude: 7 }, item.events)).toHaveLength(0);
  });
  it('checks storms and fires separately, without inferring cyclone from generic storm', () => {
    const base = fixture('earthquake'), claim = parseClaimText('A cyclone hit Tokyo', new Date(REPLAY_TIME));
    expect(checkEvents(claim, [{ ...base.events[0], eventType: 'severe_storm' }])).toHaveLength(0);
    expect(verdictFor(claim, checkEvents(claim, [{ ...base.events[0], eventType: 'tropical_cyclone' }]))).toBe('CONFIRMED');
    const fire = parseClaimText('Wildfire near Tokyo', new Date(REPLAY_TIME));
    expect(verdictFor(fire, checkEvents(fire, [{ ...base.events[0], eventType: 'wildfire' }]))).toBe('CONFIRMED');
  });
  it('needs an official exact vessel/port match for maritime claims', () => {
    const item = fixture('red-sea'), event = { ...item.events[0], eventType: 'ship_seized', entities: [{ type: 'vessel' as const, value: 'DEMO VESSEL' }], attributes: { officialStatus: true } };
    expect(verdictFor(item.claim, checkEvents(item.claim, [event]))).toBe('CONFIRMED');
    expect(checkEvents(item.claim, [{ ...event, entities: [{ type: 'vessel', value: 'OTHER SHIP' }] }])).toHaveLength(0);
    expect(checkEvents(item.claim, [{ ...event, eventType: 'ais_gap' }])).toHaveLength(0);
  });
  it('needs list name/date and exact entity; a missing listing is neutral', () => {
    const item = fixture('sanctions'); expect(checkEvents(item.claim, [{ ...item.events[0], attributes: { listed: true } }])).toHaveLength(0);
    expect(verdictFor(item.claim, checkEvents(item.claim, [{ ...item.events[0], attributes: { ...item.events[0].attributes, listed: false } }]))).toBe('NOT CONFIRMED YET');
  });
  it('requires trusted sources and independent publishers for general news', () => {
    const claim = parseClaimText('Explosion reported in Tokyo', new Date(REPLAY_TIME)), base = fixture('earthquake').events[0];
    const news = { ...base, eventType: 'news_event', attributes: { claimObservation: 'explosion', explicitConfirmation: true }, sources: [{ ...base.sources[0], id: 'publisher1', sourceType: 'trusted_news' as const }] };
    const evidence = checkEvents(claim, [news]); expect(verdictFor(claim, evidence)).toBe('NOT CONFIRMED YET');
    expect(verdictFor(claim, [...evidence, { ...evidence[0], independenceKey: 'publisher2' }])).toBe('CONFIRMED');
    expect(verdictFor(claim, [...evidence, ...evidence])).toBe('NOT CONFIRMED YET');
    expect(checkEvents(claim, [{ ...news, sources: [{ ...news.sources[0], sourceType: 'osint' }] }])).toHaveLength(0);
  });
  it('low-trust support never confirms or contradicts', () => {
    const claim = fixture('earthquake').claim;
    const evidence = { stance: 'supports', trust: 'social', aspect: 'earthquake' } as VerifyEvidence;
    expect(verdictFor(claim, [evidence])).toBe('NOT CONFIRMED YET');
  });
  it.each(['My neighbour is a criminal', 'John Doe stole money', 'Find the home address of someone'])('declines personal claim: %s', (text) => expect(() => parseClaimText(text)).toThrow('not people'));
  it('preserves uncheckable opinions even when a caller supplies another type', () => {
    const claim = fixture('opinion').claim; expect(() => validateParsedClaim({ ...claim, type: 'earthquake', expectedObservation: 'earthquake' })).toThrow();
  });
  it('validates time, location, magnitude and claim length', () => {
    const claim = fixture('earthquake').claim;
    expect(() => validateParsedClaim({ ...claim, place: { ...claim.place, latitude: 100 } })).toThrow();
    expect(() => validateParsedClaim({ ...claim, end: '2026-11-01' })).toThrow();
    expect(() => validateParsedClaim({ ...claim, minimumMagnitude: 11 })).toThrow();
    expect(() => parseClaimText('x'.repeat(3001))).toThrow();
  });
});
