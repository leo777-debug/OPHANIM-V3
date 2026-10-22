import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { deduplicateNews, publishedTime, safeSourceUrl, type FeedHealth, type NewsItem } from '@/lib/intelligence/news';
import { newsFeedCache } from '@/lib/intelligence/news-cache';
import { refreshLabel } from '@/lib/providers/resilient-feed';
import { articleObservationId, observeArticles } from '@/lib/intelligence/observations';

/**
 * Ophanim supporting news discovery. Each source fails independently.
 */

const REVIEWED_TELEGRAM_SOURCES = [
  { channel: 'OSINTtechnical', purpose: 'Conflict and infrastructure discovery', reviewOwner: 'operations', reliability: 'osint' },
  { channel: 'Faytuks', purpose: 'Breaking-event discovery', reviewOwner: 'operations', reliability: 'osint' },
  { channel: 'Liveuamap', purpose: 'Regional incident discovery', reviewOwner: 'operations', reliability: 'osint' },
  { channel: 'CyberKnow', purpose: 'Cyber incident discovery', reviewOwner: 'security', reliability: 'osint' },
];

const RSS_FEEDS = {
  BBC: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  AlJazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  GDACS: 'https://www.gdacs.org/xml/rss.xml',
  NASA: 'https://www.nasa.gov/news-release/feed/',
  CISA: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
};

const RISK_KEYWORDS = ['war','missile','strike','attack','crisis','tension','military','conflict','defense','clash','nuclear','invasion','bomb','drone','weapon','sanctions','ceasefire','escalation', 'killed', 'destroyed', 'operation', 'casualty', 'frontline', 'threat'];

const KEYWORD_COORDS: Record<string, [number, number]> = {
  'ukraine': [49.487, 31.272], 'kyiv': [50.450, 30.523], 'russia': [61.524, 105.318],
  'moscow': [55.755, 37.617], 'israel': [31.046, 34.851], 'gaza': [31.416, 34.333],
  'iran': [32.427, 53.688], 'lebanon': [33.854, 35.862], 'syria': [34.802, 38.996],
  'yemen': [15.552, 48.516], 'china': [35.861, 104.195], 'taiwan': [23.697, 120.960],
  'united states': [38.907, -77.036], 'europe': [48.800, 2.300], 'middle east': [31.500, 34.800]
};

function scoreRisk(text: string): number {
  const lower = text.toLowerCase();
  let score = 1;
  for (const kw of RISK_KEYWORDS) {
    if (lower.includes(kw)) score += 2;
  }
  return Math.min(10, score);
}

function findCoords(text: string): [number, number] | null {
  const lower = text.toLowerCase();
  for (const [keyword, coords] of Object.entries(KEYWORD_COORDS)) {
    if (lower.includes(keyword)) return coords;
  }
  return null;
}

type Article = {
  title: string; description: string; link: string; pubDate: string | null; source: string;
  coords?: [number, number]; sourcePolicy?: { reliability: string; purpose: string };
  feedMode?: 'fresh' | 'stale' | 'unavailable'; lastSuccessAt?: string | null; staleSince?: string | null;
};

function parseTelegramHTML(html: string, channel: string): Article[] {
  const items: Article[] = [];
  const messageBlockRegex = /<div class="tgme_widget_message_wrap js-widget_message_wrap"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
  let blockMatch;

  while ((blockMatch = messageBlockRegex.exec(html)) !== null) {
    const blockHtml = blockMatch[0];
    const textRegex = /<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i;
    const textMatch = blockHtml.match(textRegex);
    if (!textMatch) continue;
    
    const text = textMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
    if (!text || text.length < 10) continue;

    const dateRegex = /<a class="tgme_widget_message_date" href="(https:\/\/t\.me\/[^"]+)".*?<time datetime="([^"]+)"/i;
    const dateMatch = blockHtml.match(dateRegex);
    const link = dateMatch ? dateMatch[1] : `https://t.me/${channel}`;
    const pubDate = dateMatch ? dateMatch[2] : null;

    const title = text.split('\n')[0].substring(0, 100);

    items.push({ title, description: text, link, pubDate, source: `t.me/${channel}` });
  }
  return items;
}

const parser = new Parser<Record<string, unknown>, { geoLat?: string; geoLong?: string }>({
  customFields: { item: [['geo:lat', 'geoLat'], ['geo:long', 'geoLong']] },
});

async function parseRSSItems(xml: string, source: string): Promise<Article[]> {
  const feed = await parser.parseString(xml);
  return feed.items.slice(0, 25).flatMap((item) => {
    const link = safeSourceUrl(item.link);
    const title = (item.title ?? '').replace(/<[^>]+>/g, '').trim();
    if (!title || !link) return [];
    const lat = Number(item.geoLat), lng = Number(item.geoLong);
    const hasCoords = item.geoLat !== undefined && item.geoLong !== undefined
      && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return [{ title, description: (item.contentSnippet ?? item.content ?? '').replace(/<[^>]+>/g, '').slice(0, 1000),
      link, pubDate: item.isoDate ?? item.pubDate ?? null, source,
      ...(hasCoords ? { coords: [lat, lng] as [number, number] } : {}),
      sourcePolicy: { reliability: ['GDACS', 'CISA', 'NASA'].includes(source) ? 'primary_authority' : 'trusted_news',
        purpose: source === 'CISA' ? 'Cybersecurity advisories' : 'Supporting incident discovery' },
    }];
  });
}

export async function GET() {
  try {
    const health: FeedHealth[] = [];
    const load = async (name: string, url: string, parse: (text: string) => Article[] | Promise<Article[]>) => {
      const result = await newsFeedCache.load(name, async (signal) => {
        const res = await fetch(url, {
          signal, cache: 'no-store', redirect: 'error',
          headers: { 'User-Agent': 'Ophanim/1.0 (news feed reader)' },
        });
        if (!res.ok) throw new Error(`Source HTTP ${res.status}`);
        if (Number(res.headers.get('content-length') ?? 0) > 2000000) throw new Error('Feed too large');
        const text = await res.text();
        if (Buffer.byteLength(text) > 2000000) throw new Error('Feed too large');
        return parse(text);
      });
      const articles = result.data ?? [];
      const status: FeedHealth['status'] = result.mode === 'fresh' ? articles.length ? 'ok' : 'empty' : 'unavailable';
      const times = articles.map((item) => publishedTime(item.pubDate)).filter((time): time is number => time !== null);
      health.push({ name, url, status, count: articles.length, checkedAt: result.observation.checkedAt!,
        lastSuccessAt: result.observation.lastSuccessAt, mode: result.mode, staleSince: result.staleSince,
        latencyMs: result.observation.latencyMs, error: result.observation.error,
        refresh: refreshLabel('polling', 300),
        latestPublished: times.length ? new Date(Math.max(...times)).toISOString() : null });
      return articles.map((article): Article => ({ ...article, feedMode: result.mode, lastSuccessAt: result.observation.lastSuccessAt, staleSince: result.staleSince }));
    };
    const results = await Promise.all([
      ...REVIEWED_TELEGRAM_SOURCES.map((source) => load(`t.me/${source.channel}`, `https://t.me/s/${source.channel}`,
        (html) => parseTelegramHTML(html, source.channel).slice(-8).map((item) => ({ ...item, sourcePolicy: source })))),
      ...Object.entries(RSS_FEEDS).map(([name, url]) => load(name, url, (xml) => parseRSSItems(xml, name))),
    ]);
    const allArticles = results.flat();
    const observations = await observeArticles(allArticles.map(article => articleObservationId(article.source, article.link, article.title)));

    const newsItems = deduplicateNews(allArticles.map((article): NewsItem & Record<string, unknown> => {
      const riskScore = scoreRisk(article.description || article.title);
      const text = `${article.title} ${article.description}`;
      const coords = article.coords ?? findCoords(text);
      const region = Object.keys(KEYWORD_COORDS).find((keyword) => text.toLowerCase().includes(keyword));
      const time = publishedTime(article.pubDate);

      const id = articleObservationId(article.source, article.link, article.title);
      return {
        id,
        first_seen: observations.items[id],
        first_seen_storage: observations.storage,
        first_seen_warning: observations.warning,
        source_data_mode: article.feedMode,
        source_last_success: article.lastSuccessAt,
        source_stale_since: article.staleSince,
        title: article.title,
        description: article.description,
        link: safeSourceUrl(article.link),
        published: time === null ? null : new Date(time).toISOString(),
        source: article.source,
        evidence_tier: article.sourcePolicy?.reliability ?? 'trusted_news',
        operational_decision_eligible: false,
        verification_required: true,
        source_purpose: article.sourcePolicy?.purpose ?? 'Supporting incident discovery',
        risk_score: riskScore,
        coords: coords ? [coords[0], coords[1]] : null,
        coords_default: !coords,
        location_precision: article.coords ? 'reported' : 'approximate',
        region,
      };
    }));

    return NextResponse.json({
      news: newsItems,
      total: newsItems.length,
      observation_storage: observations.storage,
      observation_warning: observations.warning,
      news_sources: health.sort((a, b) => a.name.localeCompare(b.name)),
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch {
    return NextResponse.json({ news: [], error: 'Failed to fetch intel' }, { status: 500 });
  }
}
