import { describe, expect, it } from 'vitest';
import { aviationEventProviders, normalizeAirportWeather, normalizeFaaStatus, parseUsStations, visibilityMiles, weatherWatch } from './aviation-providers';
import { validateNormalizedIntelligenceEvent } from './event-provider';
const fetchedAt = '2026-10-20T12:00:00Z';
const raw = (payload: unknown) => ({ payload, fetchedAt, dataMode: 'fresh', staleSince: null });
const seconds = (value: string) => Date.parse(value) / 1000;
describe('official public aviation products', () => {
  it('constrains keyless station queries, normalizes cache identities and records rights', () => {
    expect(parseUsStations('kjfk,KLAX,KJFK')).toEqual(['KJFK', 'KLAX']);
    expect(() => parseUsStations('OMDB')).toThrow('continental-US');
    expect(() => parseUsStations('https://example.com')).toThrow();
    for (const provider of aviationEventProviders) { expect(provider.compliance?.().commercialUse).toBe('yes'); expect(provider.compliance?.().attribution).toBeTruthy(); expect(provider.requiresCredentials).toBe(false); }
  });
  it('parses fractional/lower-bound visibility and computes transparent watch thresholds', () => {
    expect(visibilityMiles('1/2')).toBe(0.5); expect(visibilityMiles('1 1/2')).toBe(1.5); expect(visibilityMiles('10+')).toBe(10); expect(visibilityMiles('1/0')).toBeNull();
    expect(weatherWatch({ visib: '1/2' }).score).toBe(90);
    expect(weatherWatch({ clouds: [{ cover: 'OVC', base: 800 }] }).score).toBe(70);
    expect(weatherWatch({ wspd: 52, wgst: 20 }).score).toBe(85);
    expect(weatherWatch({ wxString: 'TSRA' }).score).toBe(70);
    expect(weatherWatch({}).score).toBeNull();
    expect(weatherWatch({ fltCat: 'VFR', visib: '10+', wspd: 8 }).method).toContain('not an official');
  });
  it('retains METAR source times/points and excludes unrelated stations and arbitrary payload fields', () => {
    const source = { icaoId: 'KJFK', obsTime: seconds('2026-10-20T11:50:00Z'), rawOb: 'METAR KJFK 201150Z 34009KT 10SM CLR', lat: 40.6, lon: -73.7, visib: '10+', fltCat: 'VFR', unrelatedToken: 'must-not-persist' };
    const events = normalizeAirportWeather('metar', raw([source, { ...source, icaoId: 'OMDB' }, { ...source, icaoId: 'KLAX' }]), ['KJFK']);
    expect(events).toHaveLength(1); expect(events[0].startedAt).toBe('2026-10-20T11:50:00.000Z'); expect(events[0].location).toMatchObject({ latitude: 40.6, longitude: -73.7 });
    expect(events[0].attributes.forecast).toBe(false); expect(JSON.stringify(events)).not.toContain('must-not-persist');
    expect(() => validateNormalizedIntelligenceEvent(events[0])).not.toThrow();
    const future = normalizeAirportWeather('metar', raw([{ ...source, obsTime: seconds('2026-10-21T00:00:00Z') }]), ['KJFK'])[0];
    expect(future.startedAt).toBeUndefined(); expect(future.attributes.timeAnomaly).toBeTruthy(); expect(future.severity).toBe(0);
  });
  it('keeps TAF forecast periods separate from observations and excludes expired periods from the watch maximum', () => {
    const [event] = normalizeAirportWeather('taf', raw([{ icaoId: 'KJFK', issueTime: '2026-10-20T11:30:00Z', validTimeFrom: seconds('2026-10-20T10:00:00Z'), validTimeTo: seconds('2026-10-21T12:00:00Z'), rawTAF: 'TAF KJFK source forecast', fcsts: [
      { timeFrom: seconds('2026-10-20T10:00:00Z'), timeTo: seconds('2026-10-20T11:00:00Z'), visib: '1/4', wgst: 60 },
      { timeFrom: seconds('2026-10-20T12:00:00Z'), timeTo: seconds('2026-10-21T12:00:00Z'), visib: '6+', wgst: 36, probability: 30 },
    ] }]), ['KJFK']);
    expect(event.eventType).toBe('airport_weather_forecast'); expect(event.startedAt).toBe('2026-10-20T11:30:00.000Z'); expect(event.severity).toBe(60); expect(event.attributes.forecast).toBe(true);
    expect((event.attributes.periods as Array<{ sourceProbability: number | null }>)[1].sourceProbability).toBe(30);
    expect(() => validateNormalizedIntelligenceEvent(event)).not.toThrow();
  });
  it('reassesses cached weather age without changing the original retrieval time', () => {
    const cached = { ...raw([{ icaoId: 'KJFK', issueTime: '2026-10-20T11:00:00Z', validTimeTo: seconds('2026-10-20T13:00:00Z'), rawTAF: 'TAF KJFK example', fcsts: [{ timeFrom: seconds('2026-10-20T12:00:00Z'), timeTo: seconds('2026-10-20T13:00:00Z'), visib: '1/2' }] }]), dataMode: 'stale', staleSince: '2026-10-20T12:10:00Z' };
    const [event] = normalizeAirportWeather('taf', cached, ['KJFK'], Date.parse('2026-10-20T14:00:00Z'));
    expect(event.attributes.forecastExpired).toBe(true); expect((event.attributes.watch as { score: unknown }).score).toBeNull();
    expect(event.sources[0].retrievedAt).toBe(fetchedAt); expect(event.attributes.assessedAt).toBe('2026-10-20T14:00:00.000Z');
  });
  it('treats FAA closure categories as notices, preserves unknown onset times and never republishes the raw operator notice', () => {
    const xml = '<AIRPORT_STATUS_INFORMATION><Update_Time>Tue Oct 20 11:55:00 2026 GMT</Update_Time><Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>LAX</ARPT><Reason>PRIVATE OPERATOR WORDING CLSD EXC PPR DLY</Reason><Start>May 27 at 18:26 UTC.</Start><Reopen>May 28 at 16:00 UTC.</Reopen></Airport></Airport_Closure_List></Delay_type><Delay_type><Name>Ground Stops</Name><Ground_Stop_List><Airport><ARPT>JFK</ARPT><Reason>Weather</Reason></Airport></Ground_Stop_List></Delay_type></AIRPORT_STATUS_INFORMATION>';
    const events = normalizeFaaStatus(xml, { ...raw(xml), dataMode: 'stale', staleSince: '2026-10-20T11:59:00Z' });
    expect(events).toHaveLength(2); expect(events[0].eventType).toBe('airport_closure_notice'); expect(events[1].eventType).toBe('airport_ground_stop');
    expect(events[0].startedAt).toBeUndefined(); expect(events[0].location.latitude).toBeUndefined();
    expect(events[0].attributes).toMatchObject({ sourceUpdatedAt: '2026-10-20T11:55:00.000Z', conditionsMentioned: true, startText: 'May 27 at 18:26 UTC.', dataMode: 'stale' });
    expect(events[0].summary).toContain('conditional'); expect(JSON.stringify(events)).not.toContain('PRIVATE OPERATOR WORDING');
    expect(events.every(event => !('payload' in event.attributes))).toBe(true);
    for (const event of events) expect(() => validateNormalizedIntelligenceEvent(event)).not.toThrow();
  });
});
