import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Real-Time Geopolitical Events (GDELT 2.0 GeoJSON API)
 * Source: GDELT Project — completely free, no auth required
 * Replaces the old RSS scraper with actual GDELT geo-coded events.
 */

type GdacsIncident = { id: string; lat: number; lng: number; name: string; url: string; html: string; type: string; date: string | null };

// GDACS RSS text is XML-escaped ("MMI&gt;=VII", "&amp;eventid="); show and link the real characters.
const decodeXml = (value: string) => value
  .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
  .replace(/&(lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity, code: string) => {
    const named: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[code.toLowerCase()]) return named[code.toLowerCase()];
    const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
  })
  .replace(/&amp;/g, '&');
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export async function GET() {
  try {
    const res = await fetch('https://www.gdacs.org/xml/rss.xml', {
      next: { revalidate: 300 }, // Cache 5 min
    });

    if (!res.ok) {
      return NextResponse.json({ events: [], error: 'GDACS unavailable' });
    }

    const xml = await res.text();
    // Split by <item> instead of using regex to avoid ReDoS on large XML
    const rawItems = xml.split(/<item>/i).slice(1);
    const allEvents: GdacsIncident[] = [];
    let eventId = 0;

    for (const rawItem of rawItems) {
      const item = rawItem.split(/<\/item>/i)[0]; // get content up to </item>
      
      const titleMatch = item.match(/<title>(.*?)<\/title>/i) || item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i);
      const linkMatch = item.match(/<link>(.*?)<\/link>/i);
      const descMatch = item.match(/<description>(.*?)<\/description>/i) || item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i);
      const latMatch = item.match(/<geo:lat>(.*?)<\/geo:lat>/i);
      const lngMatch = item.match(/<geo:long>(.*?)<\/geo:long>/i);
      const typeMatch = item.match(/<gdacs:eventtype>(.*?)<\/gdacs:eventtype>/i);
      const publishedMatch = item.match(/<pubDate>(.*?)<\/pubDate>/i);

      if (!titleMatch || !latMatch || !lngMatch) continue;

      const title = decodeXml(titleMatch[1]);
      const link = linkMatch ? decodeXml(linkMatch[1]) : '';
      const desc = descMatch ? decodeXml(descMatch[1]) : '';
      const lat = parseFloat(latMatch[1]);
      const lng = parseFloat(lngMatch[1]);
      const eventType = typeMatch ? typeMatch[1] : 'UNK';

      // Map GDACS event types to Osiris types
      let type = 'conflict';
      if (eventType === 'EQ') type = 'earthquake';
      else if (eventType === 'TC') type = 'weather';
      else if (eventType === 'FL') type = 'weather';
      else if (eventType === 'VO') type = 'volcano';

      allEvents.push({
        id: `gdacs-${eventId++}`,
        lat,
        lng,
        name: title,
        url: link,
        html: `<a href="${escapeHtml(link)}" target="_blank">${escapeHtml(title)}</a><br/><i>${escapeHtml(desc)}</i>`,
        type,
        date: publishedMatch?.[1] || null,
      });
    }

    return NextResponse.json({
      events: allEvents,
      total: allEvents.length,
      timestamp: new Date().toISOString(),
      source: 'GDACS RSS API',
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] GDACS fetch error:', error);
    return NextResponse.json({ events: [], total: 0, error: 'GDACS unavailable' }, { status: 500 });
  }
}
