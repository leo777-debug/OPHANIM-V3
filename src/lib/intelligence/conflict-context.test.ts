import { describe, expect, it } from 'vitest';
import { buildConflictContext } from './conflict-context';
import type { NewsItem } from './news';
const reference = { id: 'test', label: 'OLD CLAIM', severity: 'war', lat: 50, lng: 60, region: 'testland', description: 'Historical editorial context.', sourceUrl: 'https://example.com/reference', queries: ['testland incident'] };
const article = (id: string): NewsItem => ({ id, title: 'Testland public report', description: 'A source publication.', link: `https://example.com/${id}`, source: 'BBC', published: '2026-10-20T10:00:00Z', risk_score: 1, coords: [10, 20], coords_default: false, location_precision: 'approximate', source_data_mode: 'fresh' });
describe('honest conflict reference/news separation', () => {
  it('keeps approximate, undated, future and stale news out of the reported-point layer', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const data = buildConflictContext([reference], [article('approx'), { ...article('undated'), location_precision: 'reported', published: null }, { ...article('future'), location_precision: 'reported', published: '2026-10-21T00:00:00Z' }, { ...article('stale'), location_precision: 'reported', source_data_mode: 'stale' }], [], now);
    expect(data.liveEvents).toEqual([]); expect(data.reports).toHaveLength(4);
    expect(data.zones[0]).toMatchObject({ label: 'REFERENCE · TESTLAND', reference: true, referenceDate: null, lastUpdated: null, eventCount: 4 });
    expect(data.activeWarzones).toBeNull();
  });
  it('retains actual reported coordinates and publication times without offsets or fabricated current timestamps', () => {
    const news = { ...article('reported'), location_precision: 'reported' as const };
    const data = buildConflictContext([reference], [news], [], Date.parse('2026-10-20T12:00:00Z'));
    expect(data.liveEvents[0]).toMatchObject({ lat: 10, lng: 20, timestamp: news.published, type: 'news_report', verificationRequired: true });
    expect(data.lastSuccessfulFetchAt).toBeNull(); expect(data.dataMode).toBe('freshness unknown');
    expect(buildConflictContext([reference], [], []).dataMode).toBe('unavailable');
  });
});
