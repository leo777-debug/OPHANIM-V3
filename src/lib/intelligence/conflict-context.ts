import type { FeedHealth, NewsItem } from './news';
export type ConflictReference = { id: string; label: string; severity: string; lat: number; lng: number; region: string; description: string; sourceUrl: string; queries: string[] };
export function buildConflictContext(references: ConflictReference[], news: NewsItem[], health: FeedHealth[], now = Date.now()) {
  const reports = news.flatMap(item => {
    const content = `${item.title} ${item.description}`.toLowerCase();
    const zoneIds = references.filter(zone => content.includes(zone.region.toLowerCase()) || zone.queries.some(query => query.toLowerCase().split(/\s+/).every(term => content.includes(term)))).map(zone => zone.id);
    return zoneIds.length ? [{ ...item, zoneIds, interpretation: 'News text associated with a reference region; not a verified conflict incident or precise location.' }] : [];
  });
  const observed = reports.filter(item => item.location_precision === 'reported' && item.coords && item.coords.length === 2 && item.coords.every(Number.isFinite) && Math.abs(item.coords[0]) <= 90 && Math.abs(item.coords[1]) <= 180 && item.published && Number.isFinite(Date.parse(item.published)) && Date.parse(item.published) <= now && Date.parse(item.published) >= now - 86400000 && item.source_data_mode !== 'stale');
  const points = observed.map(item => ({ id: item.id, lat: item.coords![0], lng: item.coords![1], title: item.title, url: item.link, type: 'news_report', timestamp: item.published, source: item.source, locationPrecision: 'reported', verificationRequired: true, sourceDataMode: item.source_data_mode ?? 'unknown', zoneIds: item.zoneIds }));
  const successful = health.filter(source => source.status === 'ok' || source.status === 'empty');
  const times = health.flatMap(source => source.lastSuccessAt && Number.isFinite(Date.parse(source.lastSuccessAt)) ? [Date.parse(source.lastSuccessAt)] : []);
  return {
    zones: references.map(zone => ({ id: zone.id, label: `REFERENCE · ${zone.region.toUpperCase()}`, severity: zone.severity, lat: zone.lat, lng: zone.lng, region: zone.region, sourceUrl: zone.sourceUrl,
      description: `Undated editorial reference area; not current conflict status. Original context: ${zone.description}`, reference: true, referenceDate: null,
      events: points.filter(point => point.zoneIds.includes(zone.id)).slice(0, 20), eventCount: reports.filter(report => report.zoneIds.includes(zone.id)).length,
      countMeaning: 'News mentions, not verified incidents or independent corroboration', lastUpdated: null,
    })),
    reports, liveEvents: points, totalZones: references.length, totalLiveEvents: points.length, activeWarzones: null,
    pointMeaning: 'Legacy liveEvents field contains only source-reported news points published within 24 h; no continuous stream or confirmed conflict event is implied.',
    dataMode: successful.length ? 'periodic news context' : news.some(item => item.source_data_mode === 'stale') ? 'stale' : news.length ? 'freshness unknown' : 'unavailable',
    timestamp: new Date(now).toISOString(), timestampMeaning: 'Response generation time, not event time', lastSuccessfulFetchAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    sources: [...new Set(reports.map(report => report.source))], news_sources: health, refreshInterval: 300,
  };
}
