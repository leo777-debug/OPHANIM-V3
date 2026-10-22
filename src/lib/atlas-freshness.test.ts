import { describe, expect, it } from 'vitest';
import { adsbObservationTime, filterCurrentAtlasData, isRecentObservation, POSITION_MAX_AGE_MS, REPORT_MAX_AGE_MS, sourceTime } from './atlas-freshness';

const now = Date.parse('2026-10-10T12:00:00Z');
const snapshot = { checkedAt: now, sourceFetchedAt: now };

describe('source observation times', () => {
  it('normalizes seconds, milliseconds and explicitly UTC source strings', () => {
    expect(sourceTime(now / 1000)).toBe(now);
    expect(sourceTime(now)).toBe(now);
    expect(sourceTime('2026-10-10 12:00:00')).toBe(now);
    expect(sourceTime(null)).toBeNull();
    expect(sourceTime(44)).toBeNull(); // AIS second-of-minute is not an epoch.
    expect(sourceTime('not a date')).toBeNull();
  });
  it('derives ADS-B position time from source snapshot, never local receipt time', () => {
    expect(adsbObservationTime({ seen_pos: 30 }, now / 1000)).toBe(now - 30_000);
    expect(adsbObservationTime({ seen_pos: 30 }, null)).toBeNull();
    expect(adsbObservationTime({}, now)).toBeNull();
  });
  it('rejects future and old observations at explicit boundaries', () => {
    expect(isRecentObservation(now - POSITION_MAX_AGE_MS, POSITION_MAX_AGE_MS, now)).toBe(true);
    expect(isRecentObservation(now - POSITION_MAX_AGE_MS - 1, POSITION_MAX_AGE_MS, now)).toBe(false);
    expect(isRecentObservation(now + 1, REPORT_MAX_AGE_MS, now)).toBe(false);
  });
});

describe('current atlas view', () => {
  it('does not let a fresh fetch make old or undated news current', () => {
    const news = [{ published: new Date(now - 1000).toISOString() }, { published: new Date(now - REPORT_MAX_AGE_MS - 1).toISOString() }, { published: null }];
    const result = filterCurrentAtlasData({ news }, { '/api/news': snapshot }, now);
    expect(result.data.news).toEqual([news[0]]);
    expect(result.feeds[0]).toMatchObject({ current: 1, withheld: 2 });
    expect(news).toHaveLength(3);
  });
  it('expires the view without requiring another successful network request', () => {
    const result = filterCurrentAtlasData({ maritime_ships: [{ timestamp: now - 1000 }] }, { '/api/maritime': snapshot }, now + POSITION_MAX_AGE_MS + 1);
    expect(result.data.maritime_ships).toEqual([]);
    expect(result.feeds[0].reason).toContain('expired');
  });
  it('keeps a still-active official weather warning but drops expired warnings', () => {
    const active = { date: new Date(now - 2 * REPORT_MAX_AGE_MS).toISOString(), expires: new Date(now + 3600_000).toISOString() };
    const result = filterCurrentAtlasData({ weather_events: [active, { date: new Date(now - 1000).toISOString(), expires: new Date(now - 1).toISOString() }] }, { '/api/weather': snapshot }, now);
    expect(result.data.weather_events).toEqual([active]);
  });
  it('never removes reference geography or rewrites observation dates', () => {
    const cables = [{ id: 'reference' }];
    const result = filterCurrentAtlasData({ submarine_cables: cables }, {}, now);
    expect(result.data.submarine_cables).toBe(cables);
    expect(result.feeds).toEqual([]);
  });
  it('uses the detection time, not just the date of a satellite CSV download', () => {
    const result = filterCurrentAtlasData({ fires: [{ date: '2026-10-09', time: '1300' }, { date: '2026-10-09', time: '1100' }] }, { '/api/fires': snapshot }, now);
    expect(result.data.fires).toHaveLength(1);
  });
  it('reports source failures while retaining only still-recent data', () => {
    const result = filterCurrentAtlasData({ news: [{ published: new Date(now).toISOString() }] }, { '/api/news': { ...snapshot, error: 'Source HTTP 503' } }, now);
    expect(result.feeds[0]).toMatchObject({ current: 1, reason: 'Source HTTP 503' });
  });
  it('isolates invalid items without discarding other sources', () => {
    const result = filterCurrentAtlasData({ news: [null, { published: new Date(now).toISOString() }] }, { '/api/news': snapshot }, now);
    expect(result.feeds[0]).toMatchObject({ current: 1, withheld: 1 });
  });
  it('keeps an old CVE newly listed today, not an unchanged historical advisory', () => {
    const recent = { published: '2025-01-01', modified: '2026-01-01', listedAt: '2026-10-10' };
    const result = filterCurrentAtlasData({ cyberThreats: [recent, { published: '2025-01-01' }] }, { '/api/cyber-threats': snapshot }, now);
    expect(result.data.cyberThreats).toEqual([recent]);
  });
});
