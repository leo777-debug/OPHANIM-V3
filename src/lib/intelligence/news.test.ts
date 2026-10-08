import { describe, expect, it } from 'vitest';
import { buildTimeline, deduplicateNews, filterNews, newsCsv, regionalCoverage, safeSourceUrl, type NewsItem } from './news';

const now = Date.parse('2026-10-08T12:00:00Z');
const item: NewsItem = { id: 'a', title: 'Port disruption', description: 'Singapore port', source: 'BBC',
  published: '2026-10-08T11:00:00Z', link: 'https://example.com/a', risk_score: 6,
  coords: [1.3, 103.8], coords_default: false, region: 'singapore', location_precision: 'approximate' };

describe('intelligence desk', () => {
  it('combines search, source, time, severity and unread filters', () => {
    expect(filterNews([item], { query: 'PORT', source: 'BBC', hours: 6, minRisk: 6, unreadOnly: true, seen: new Set() }, now)).toEqual([item]);
    expect(filterNews([item], { unreadOnly: true, seen: new Set(['a']) }, now)).toEqual([]);
    expect(filterNews([item], { source: 'NASA' }, now)).toEqual([]);
    expect(filterNews([item], { minRisk: 8 }, now)).toEqual([]);
    expect(filterNews([item], { hours: 1 }, now + 1)).toEqual([]);
  });
  it('does not present invalid, undated or future publications as recent', () => {
    const bad = [null, 'invalid', '2026-10-09T00:00:00Z'].map((published) => ({ ...item, published }));
    expect(filterNews(bad, { hours: 24 }, now)).toEqual([]);
    expect(filterNews(bad, {}, now)).toHaveLength(3);
  });
  it('deduplicates tracking URLs while preserving separate publisher evidence', () => {
    const repeated = { ...item, id: 'b', link: 'https://example.com/a?utm_source=rss#top' };
    expect(deduplicateNews([item, repeated, { ...item, id: 'c', source: 'GDACS' }])).toHaveLength(2);
  });
  it('escapes CSV and prevents spreadsheet formula injection', () => {
    const csv = newsCsv([{ ...item, title: '=HYPERLINK("bad")', source: ' @bad' }]);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\' @bad"');
    expect(newsCsv([{ ...item, coords: [-12.3, -45.6] }])).toContain('"-12.3","-45.6"');
  });
  it('rejects executable and malformed source links', () => {
    expect(safeSourceUrl('javascript:alert(1)')).toBe('');
    expect(safeSourceUrl('//example.com')).toBe('');
    expect(safeSourceUrl('https://example.com')).toBe('https://example.com/');
  });
  it('builds a dated cross-stream timeline without fabricated timestamps', () => {
    const events = buildTimeline([item, { ...item, id: 'undated', published: null }],
      [{ id: 'q1', place: 'Pacific', magnitude: 5, time: now, url: 'https://earthquake.usgs.gov/a', lat: 0, lng: 180 }], 24, now);
    expect(events.map((event) => event.id)).toEqual(['quake:q1', 'news:a']);
    expect(events[0].coords).toEqual([0, 180]);
  });
  it('counts regional mentions without treating multiple items as independent sources', () => {
    const regions = regionalCoverage([item, { ...item, id: 'b' }, { ...item, id: 'c', source: 'GDACS' }, { ...item, region: undefined }]);
    expect(regions[0].count).toBe(3);
    expect(regions[0].sources.size).toBe(2);
  });
});
