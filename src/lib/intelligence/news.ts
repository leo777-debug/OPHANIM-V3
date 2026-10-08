export interface NewsItem {
  id: string;
  title: string;
  description: string;
  summary?: string;
  link: string;
  published: string | null;
  source: string;
  risk_score: number;
  coords: [number, number] | null;
  coords_default: boolean;
  location_precision?: 'reported' | 'approximate';
  region?: string;
  evidence_tier?: string;
  machine_assessment?: string;
}

export interface FeedHealth {
  name: string;
  url: string;
  status: 'ok' | 'empty' | 'unavailable';
  count: number;
  checkedAt: string;
  latestPublished: string | null;
}

export const NEWS_WINDOWS = [1, 6, 24, 48, 168] as const;

export function safeSourceUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function publishedTime(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function filterNews(items: NewsItem[], filters: {
  query?: string; source?: string; hours?: number; minRisk?: number;
  unreadOnly?: boolean; seen?: ReadonlySet<string>;
}, now = Date.now()): NewsItem[] {
  const needle = (filters.query ?? '').trim().toLowerCase();
  return items.filter((item) => {
    const time = publishedTime(item.published);
    return (!needle || `${item.title} ${item.description} ${item.source}`.toLowerCase().includes(needle))
      && (!filters.source || item.source === filters.source)
      && (!filters.hours || (time !== null && time <= now && time >= now - filters.hours * 3600000))
      && (item.risk_score >= (filters.minRisk ?? 0))
      && (!filters.unreadOnly || !filters.seen?.has(item.id));
  });
}

export function deduplicateNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return [...items].sort((a, b) => (publishedTime(b.published) ?? 0) - (publishedTime(a.published) ?? 0))
    .filter((item) => {
      // Keep separate publishers as separate evidence; collapse repeated links from one source.
      let canonical = item.link;
      try {
        const url = new URL(item.link);
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
          if (key.startsWith('utm_')) url.searchParams.delete(key);
        }
        canonical = url.href;
      } catch { /* Unlinked items use the stable item ID. */ }
      const key = `${item.source}:${canonical || item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function newsCsv(items: NewsItem[]): string {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [['id', 'title', 'source', 'published', 'risk_score', 'link', 'latitude', 'longitude', 'location_precision'],
    ...items.map((item) => [item.id, item.title, item.source, item.published, item.risk_score, item.link,
      item.coords?.[0], item.coords?.[1], item.location_precision])]
    .map((row) => row.map(cell).join(',')).join('\r\n');
}

export interface TimelineEvent {
  id: string; title: string; source: string; time: number;
  link: string; coords: [number, number] | null; kind: 'news' | 'earthquake';
}

export function buildTimeline(news: NewsItem[], earthquakes: Array<{
  id: string; place: string; magnitude: number; time: number; url: string; lat: number; lng: number;
}>, hours: number, now = Date.now()): TimelineEvent[] {
  const events: TimelineEvent[] = news.flatMap((item) => {
    const time = publishedTime(item.published);
    return time === null ? [] : [{ id: `news:${item.id}`, title: item.title, source: item.source, time,
      link: safeSourceUrl(item.link), coords: item.coords, kind: 'news' as const }];
  });
  for (const quake of earthquakes) {
    const time = publishedTime(quake.time);
    if (time === null) continue;
    const validCoords = Number.isFinite(quake.lat) && Number.isFinite(quake.lng)
      && Math.abs(quake.lat) <= 90 && Math.abs(quake.lng) <= 180;
    events.push({ id: `quake:${quake.id}`, title: `M${quake.magnitude} - ${quake.place}`, source: 'USGS',
      time, link: safeSourceUrl(quake.url), coords: validCoords ? [quake.lat, quake.lng] : null, kind: 'earthquake' });
  }
  return events.filter((item) => item.time <= now && item.time >= now - hours * 3600000)
    .sort((a, b) => b.time - a.time);
}

export function regionalCoverage(items: NewsItem[]) {
  const regions = new Map<string, { name: string; count: number; sources: Set<string>; coords: [number, number] }>();
  for (const item of items) {
    if (!item.region || !item.coords) continue;
    const entry = regions.get(item.region) ?? { name: item.region, count: 0, sources: new Set<string>(), coords: item.coords };
    entry.count++;
    entry.sources.add(item.source);
    regions.set(item.region, entry);
  }
  return [...regions.values()].sort((a, b) => b.sources.size - a.sources.size || b.count - a.count);
}
