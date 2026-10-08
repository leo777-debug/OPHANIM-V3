import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const rss = `<rss version="2.0" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#"><channel><title>Test</title>
  <item><title>Ukraine port update</title><link>https://example.com/update</link><pubDate>Thu, 08 Oct 2026 09:00:00 GMT</pubDate><description>Port report</description><geo:lat>46.5</geo:lat><geo:long>30.7</geo:long></item>
  <item><title>Unknown date</title><link>https://example.com/undated</link></item></channel></rss>`;
afterEach(() => vi.unstubAllGlobals());
describe('news API', () => {
  it('keeps RSS available when Telegram fails, parses source coordinates, and exposes health', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('t.me')) throw new Error('unavailable');
      return new Response(rss);
    }));
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.news).toHaveLength(10);
    expect(body.news_sources).toHaveLength(9);
    expect(body.news_sources.filter((source: { status: string }) => source.status === 'unavailable')).toHaveLength(4);
    expect(body.news.find((item: { source: string; title: string }) => item.source === 'GDACS' && item.title.includes('Ukraine')))
      .toMatchObject({ coords: [46.5, 30.7], location_precision: 'reported', evidence_tier: 'primary_authority' });
    expect(body.news.find((item: { title: string }) => item.title === 'Unknown date').published).toBeNull();
  });
  it('loads RSS even when Telegram succeeds', async () => {
    const html = `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div><div><div class="tgme_widget_message_text">A long Ukraine news report</div><a class="tgme_widget_message_date" href="https://t.me/test/1"><time datetime="2026-10-08T10:00:00Z"></time></a></div></div></div>`;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.includes('t.me') ? html : rss)));
    const body = await (await GET()).json();
    expect(body.news.some((item: { source: string }) => item.source === 'BBC')).toBe(true);
    expect(body.news.some((item: { source: string }) => item.source.startsWith('t.me/'))).toBe(true);
  });
  it('degrades gracefully when every source is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.news).toEqual([]);
    expect(body.news_sources.every((source: { status: string }) => source.status === 'unavailable')).toBe(true);
  });
});
