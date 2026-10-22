import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';
const news = vi.hoisted(() => vi.fn());
vi.mock('@/app/api/news/route', () => ({ GET: news }));
describe('conflict context API', () => {
  it('does not scatter headline mentions into synthetic conflict event locations', async () => {
    news.mockResolvedValue(new Response(JSON.stringify({ news: [{ id: 'news', title: 'Ukraine update', description: 'Public reporting', source: 'BBC', published: null, link: 'https://example.com/report', coords: [49, 31], location_precision: 'approximate' }], news_sources: [] })));
    const body = await (await GET()).json(); expect(body.liveEvents).toEqual([]); expect(body.reports).toHaveLength(1);
    expect(body.zones.every((zone: { reference: boolean; lastUpdated: unknown }) => zone.reference && zone.lastUpdated === null)).toBe(true);
    expect(body.activeWarzones).toBeNull();
  });
  it('returns an unavailable state with undated reference context when news fails', async () => {
    news.mockRejectedValue(new Error('Source unavailable')); const response = await GET(), body = await response.json();
    expect(body.dataMode).toBe('unavailable'); expect(body.liveEvents).toEqual([]); expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
