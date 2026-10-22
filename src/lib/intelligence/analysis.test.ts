import { describe, expect, it } from 'vitest';
import { canonicalStoryUrl, clusterStories, correlateEntities, detectConvergence, distanceKm, extractEntities, meetsTrust, normalizeTitle, trustFor, whyItMatters, type ConvergenceSignal } from './analysis';
import type { NewsItem } from './news';
const now = Date.parse('2026-10-19T12:00:00Z');
const article = (id: string, changes: Partial<NewsItem> = {}): NewsItem => ({ id, title: 'Major earthquake closes coastal port operations today', description: 'United Nations reviews reports from Jebel Ali.', link: `https://example.com/${id}`, source: id, published: '2026-10-19T11:00:00Z', first_seen: '2026-10-19T11:30:00Z', risk_score: 2, coords: null, coords_default: true, ...changes });
const signal = (id: string, type: ConvergenceSignal['type'], source = id): ConvergenceSignal => ({ id, type, source, independenceKey: source, trust: trustFor('USGS'), time: '2026-10-19T11:00:00Z', lat: 25, lng: 55, title: id, url: 'https://example.com' });

describe('deterministic story clustering', () => {
  it('canonicalizes tracking params and fragments without losing content selectors', () => {
    expect(canonicalStoryUrl('http://www.example.com/a/?utm_source=x&story=2#top')).toBe('https://example.com/a?story=2');
    expect(canonicalStoryUrl('javascript:alert(1)')).toBe('');
  });
  it('clusters publishers and keeps first observation separate from publication time', () => {
    const clusters = clusterStories([article('BBC'), article('NASA', { title: 'Earthquake closes coastal port operations today', first_seen: '2026-10-19T11:45:00Z' })], { now });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ publisherCount: 2, firstSeen: '2026-10-19T11:30:00.000Z', earliestPublication: '2026-10-19T11:00:00.000Z' });
    expect(clusters[0].entities.some(entity => entity.id === 'port:jebel-ali')).toBe(true);
  });
  it('does not group distant dates, uncertain undated titles, empty titles or unrelated stories', () => {
    const clusters = clusterStories([article('a'), article('b', { published: '2026-10-10T11:00:00Z' }), article('c', { published: null }), article('d', { title: 'Rainfall forecast for the northern mountains' })], { now });
    expect(clusters).toHaveLength(4);
    const undated = clusterStories([article('x', { published: null, first_seen: undefined })], { now })[0];
    expect(undated.firstSeen).toBeNull(); expect(undated.earliestPublication).toBeNull();
    expect(clusterStories([article('a', { title: '' }), article('b', { title: '' })], { now })).toHaveLength(2);
  });
  it('handles Arabic normalization and order deterministically', () => {
    expect(normalizeTitle('إغلاقٌ في مَضيق هرمز!')).toBe('إغلاق في مضيق هرمز');
    const a = article('a'), b = article('b');
    expect(clusterStories([a, b], { now })).toEqual(clusterStories([b, a], { now }));
    expect(() => clusterStories([], { similarity: 2 })).toThrow();
  });
  it('preserves generic alerts at different reported locations and reused titles from one publisher', () => {
    expect(clusterStories([article('a', { source: 'GDACS' }), article('b', { source: 'GDACS' })], { now })).toHaveLength(2);
    expect(clusterStories([article('a', { coords: [0, 0], location_precision: 'reported' }), article('b', { coords: [20, 20], location_precision: 'reported' })], { now })).toHaveLength(2);
  });
});
describe('entity extraction and public-role restriction', () => {
  it('uses boundaries, aliases and valid explicit vessel/aircraft identifiers', () => {
    const entities = extractEntities('Iranian rain in Iran and إيران; IMO 9074729, IMO 9074720; MMSI 123456789; ICAO24 A1B2C3.');
    expect(entities.map(entity => entity.id)).toEqual(['country:IR', 'imo:9074729', 'mmsi:123456789', 'aircraft:A1B2C3']);
    expect(extractEntities('Ukraine' + 'x')).toEqual([]);
  });
  it('extracts people only from an explicit public-role dictionary', () => {
    expect(extractEntities('Jane Example', [{ id: 'person:jane', label: 'Jane Example', aliases: ['Jane Example'], type: 'public_person' }])).toEqual([]);
    expect(extractEntities('Jane Example', [{ id: 'person:jane', label: 'Jane Example', aliases: ['Jane Example'], type: 'public_person', publicRole: 'Official public spokesperson (test fixture)' }])).toHaveLength(1);
  });
  it('links shared entities across publishers with evidence identifiers', () => {
    const linked = correlateEntities([article('BBC'), article('NASA')]);
    expect(linked.find(item => item.entity.id === 'port:jebel-ali')).toMatchObject({ articleIds: ['BBC', 'NASA'], publishers: ['BBC', 'NASA'] });
  });
});
describe('trust and context', () => {
  it('defaults unknown sources to unreviewed and never infers editorial flags', () => {
    expect(trustFor('Unknown')).toMatchObject({ tier: 'social', configuredBy: 'unreviewed', propagandaRisk: false });
    expect(meetsTrust(trustFor('BBC'), 'wire')).toBe(false);
    expect(meetsTrust(trustFor('USGS'), 'official')).toBe(true);
    expect(whyItMatters(article('x')).label).toContain('INFERENCE');
  });
});
describe('geographic convergence', () => {
  it('scores unique independent source types and exposes every contribution', () => {
    const result = detectConvergence([signal('a', 'seismic'), signal('b', 'fire'), signal('c', 'news'), signal('d', 'fire')], { now });
    expect(result).toHaveLength(1); expect(result[0].score).toBe(45);
    expect(result[0].contributions).toHaveLength(4);
  });
  it('does not let repeated source types or dependent publishers inflate the score', () => {
    expect(detectConvergence([signal('a', 'news'), signal('b', 'news'), signal('c', 'news')], { now })).toEqual([]);
    expect(detectConvergence([signal('a', 'seismic', 'same'), signal('b', 'fire', 'same'), signal('c', 'news', 'same')], { now })).toEqual([]);
  });
  it('rejects future, old, distant, invalid and untrusted observations', () => {
    const valid = [signal('a', 'seismic'), signal('b', 'fire')];
    for (const changes of [{ time: '2027-01-01' }, { time: '2026-01-01' }, { lat: -40 }, { lat: NaN }, { trust: trustFor('Unknown') }, { independenceKey: 'unreviewed' }]) expect(detectConvergence([...valid, { ...signal('c', 'news'), ...changes }], { now })).toEqual([]);
    expect(() => detectConvergence([], { radiusKm: -1 })).toThrow();
  });
  it('handles date-line proximity and configurable minimum trust', () => {
    expect(distanceKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeLessThan(23);
    expect(detectConvergence([signal('a', 'seismic'), { ...signal('b', 'news'), trust: trustFor('BBC') }], { now, minimumTypes: 2, minimumScore: 30, minimumTrust: 'official' })).toEqual([]);
  });
});
