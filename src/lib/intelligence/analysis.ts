import { publishedTime, type NewsItem } from './news';
import type { TrustTier } from '@/lib/verify/types';

export const TRUST_RANK: Record<TrustTier, number> = { social: 0, aggregator: 1, established_media: 2, wire: 3, official: 4 };
export interface SourceTrust {
  tier: TrustTier;
  independenceKey: string;
  stateAffiliated: boolean;
  propagandaRisk: boolean;
  configuredBy: 'operator' | 'unreviewed';
}

/** Editorial configuration only; neither flag is inferred from article text or AI. */
const REVIEWED_TRUST: Record<string, SourceTrust> = {
  USGS: { tier: 'official', independenceKey: 'usgs', stateAffiliated: true, propagandaRisk: false, configuredBy: 'operator' },
  NASA: { tier: 'official', independenceKey: 'nasa', stateAffiliated: true, propagandaRisk: false, configuredBy: 'operator' },
  CISA: { tier: 'official', independenceKey: 'cisa', stateAffiliated: true, propagandaRisk: false, configuredBy: 'operator' },
  GDACS: { tier: 'official', independenceKey: 'gdacs', stateAffiliated: false, propagandaRisk: false, configuredBy: 'operator' },
  BBC: { tier: 'established_media', independenceKey: 'bbc', stateAffiliated: true, propagandaRisk: false, configuredBy: 'operator' },
  AlJazeera: { tier: 'established_media', independenceKey: 'aljazeera', stateAffiliated: true, propagandaRisk: false, configuredBy: 'operator' },
};
export function trustFor(source: string, overrides: Record<string, SourceTrust> = {}): SourceTrust {
  return overrides[source] ?? REVIEWED_TRUST[source] ?? { tier: 'social', independenceKey: 'unreviewed', stateAffiliated: false, propagandaRisk: false, configuredBy: 'unreviewed' };
}
export function meetsTrust(source: SourceTrust, minimum: TrustTier) { return TRUST_RANK[source.tier] >= TRUST_RANK[minimum]; }

export function canonicalStoryUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    url.hash = ''; url.hostname = url.hostname.replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    // Treat HTTP and HTTPS links to the same public article as one identity.
    url.protocol = 'https:';
    return url.href;
  } catch { return ''; }
}
export function normalizeTitle(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'is', 'of', 'on', 'the', 'to', 'with', 'في', 'من', 'على', 'عن']);
function tokens(value: string) { return new Set(normalizeTitle(value).split(' ').filter(word => word.length > 1 && !STOP.has(word))); }
export function titleSimilarity(a: string, b: string) {
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0; for (const word of left) if (right.has(word)) common++;
  return common / (left.size + right.size - common);
}

export interface StoryCluster {
  id: string; title: string; articles: NewsItem[]; publishers: string[]; publisherCount: number;
  firstSeen: string | null; earliestPublication: string | null; entities: ExtractedEntity[];
  method: 'deterministic-title-and-url';
}
export function clusterStories(items: NewsItem[], options: { windowHours?: number; similarity?: number; now?: number } = {}): StoryCluster[] {
  const windowMs = (options.windowHours ?? 36) * 3600000, threshold = options.similarity ?? 0.65;
  if (!(windowMs > 0) || threshold < 0 || threshold > 1) throw new Error('Invalid clustering configuration.');
  const now = options.now ?? Date.now();
  const clusters: StoryCluster[] = [];
  const sorted = [...items].sort((a, b) => (publishedTime(a.published) ?? Infinity) - (publishedTime(b.published) ?? Infinity) || a.id.localeCompare(b.id));
  for (const article of sorted) {
    const time = publishedTime(article.published), url = canonicalStoryUrl(article.link);
    const cluster = clusters.find(candidate => {
      const anchor = candidate.articles[0], anchorTime = publishedTime(anchor.published);
      const sameUrl = Boolean(url && url === canonicalStoryUrl(anchor.link));
      // Reused publisher alert titles can describe distinct events. Preserve them
      // unless their canonical article identity is the same.
      if (anchor.source === article.source && !sameUrl) return false;
      if (!sameUrl && anchor.coords && article.coords && anchor.location_precision === 'reported' && article.location_precision === 'reported'
        && distanceKm({ lat: anchor.coords[0], lng: anchor.coords[1] }, { lat: article.coords[0], lng: article.coords[1] }) > 100) return false;
      // Undated articles may match a URL, but never acquire a made-up publication time.
      if (time === null || anchorTime === null) return sameUrl;
      if (time > now || anchorTime > now || Math.abs(time - anchorTime) > windowMs) return false;
      if (sameUrl) return true;
      const normalized = normalizeTitle(article.title);
      return Boolean(normalized && normalized === normalizeTitle(anchor.title))
        || (tokens(article.title).size >= 4 && tokens(anchor.title).size >= 4 && titleSimilarity(article.title, anchor.title) >= threshold);
    });
    if (cluster) cluster.articles.push(article);
    else clusters.push({ id: `story:${article.id}`, title: article.title, articles: [article], publishers: [], publisherCount: 0, firstSeen: null, earliestPublication: null, entities: [], method: 'deterministic-title-and-url' });
  }
  for (const cluster of clusters) {
    cluster.publishers = [...new Set(cluster.articles.map(item => item.source))].sort();
    cluster.publisherCount = cluster.publishers.length;
    const earliest = (values: Array<string | null | undefined>) => {
      const times = values.map(publishedTime).filter((time): time is number => time !== null && time <= now);
      return times.length ? new Date(Math.min(...times)).toISOString() : null;
    };
    cluster.firstSeen = earliest(cluster.articles.map(item => item.first_seen));
    cluster.earliestPublication = earliest(cluster.articles.map(item => item.published));
    const entities = cluster.articles.flatMap(item => extractEntities(`${item.title} ${item.description}`));
    cluster.entities = [...new Map(entities.map(entity => [entity.id, entity])).values()];
  }
  return clusters.sort((a, b) => Math.max(...b.articles.map(item => publishedTime(item.published) ?? 0)) - Math.max(...a.articles.map(item => publishedTime(item.published) ?? 0)) || a.id.localeCompare(b.id));
}

export interface GazetteerEntry {
  id: string; label: string; aliases: string[];
  type: 'country' | 'place' | 'port' | 'airport' | 'organization' | 'public_person';
  publicRole?: string;
}
/** Small curated dictionary, not a claim of global geographic coverage. */
export const GAZETTEER: GazetteerEntry[] = [
  { id: 'country:AE', label: 'United Arab Emirates', aliases: ['United Arab Emirates', 'UAE', 'الإمارات'], type: 'country' },
  { id: 'country:IR', label: 'Iran', aliases: ['Iran', 'إيران'], type: 'country' },
  { id: 'country:UA', label: 'Ukraine', aliases: ['Ukraine', 'أوكرانيا'], type: 'country' },
  { id: 'country:RU', label: 'Russia', aliases: ['Russia', 'روسيا'], type: 'country' },
  { id: 'country:CN', label: 'China', aliases: ['China', 'الصين'], type: 'country' },
  { id: 'country:US', label: 'United States', aliases: ['United States', 'USA', 'الولايات المتحدة'], type: 'country' },
  { id: 'country:IN', label: 'India', aliases: ['India', 'الهند'], type: 'country' },
  { id: 'country:YE', label: 'Yemen', aliases: ['Yemen', 'اليمن'], type: 'country' },
  { id: 'place:hormuz', label: 'Strait of Hormuz', aliases: ['Strait of Hormuz', 'Hormuz', 'مضيق هرمز'], type: 'place' },
  { id: 'place:suez', label: 'Suez Canal', aliases: ['Suez Canal', 'قناة السويس'], type: 'place' },
  { id: 'place:bab-el-mandeb', label: 'Bab el-Mandeb', aliases: ['Bab el-Mandeb', 'Bab al-Mandab', 'باب المندب'], type: 'place' },
  { id: 'place:malacca', label: 'Strait of Malacca', aliases: ['Strait of Malacca', 'Malacca Strait'], type: 'place' },
  { id: 'port:jebel-ali', label: 'Jebel Ali', aliases: ['Jebel Ali', 'جبل علي'], type: 'port' },
  { id: 'port:rotterdam', label: 'Port of Rotterdam', aliases: ['Port of Rotterdam'], type: 'port' },
  { id: 'airport:OMDB', label: 'Dubai International Airport', aliases: ['Dubai International Airport', 'OMDB'], type: 'airport' },
  { id: 'airport:EGLL', label: 'Heathrow Airport', aliases: ['Heathrow Airport', 'EGLL'], type: 'airport' },
  { id: 'organization:un', label: 'United Nations', aliases: ['United Nations', 'الأمم المتحدة'], type: 'organization' },
  { id: 'organization:who', label: 'World Health Organization', aliases: ['World Health Organization', 'منظمة الصحة العالمية'], type: 'organization' },
];
export interface ExtractedEntity { id: string; label: string; type: GazetteerEntry['type'] | 'imo' | 'mmsi' | 'aircraft'; method: 'dictionary' | 'identifier'; publicRole?: string }
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function extractEntities(text: string, dictionary: GazetteerEntry[] = GAZETTEER): ExtractedEntity[] {
  const normalized = normalizeTitle(text), result: ExtractedEntity[] = [];
  for (const entry of dictionary) {
    if (entry.type === 'public_person' && !entry.publicRole) continue;
    if (entry.aliases.some(alias => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(normalizeTitle(alias))}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalized))) result.push({ id: entry.id, label: entry.label, type: entry.type, method: 'dictionary', ...(entry.publicRole ? { publicRole: entry.publicRole } : {}) });
  }
  for (const match of text.matchAll(/\b(IMO|MMSI)\s*[:#-]?\s*(\d{7}|\d{9})\b/gi)) {
    const type = match[1].toLowerCase() as 'imo' | 'mmsi', value = match[2];
    if (type === 'imo' && (value.length !== 7 || [...value.slice(0, 6)].reduce((sum, digit, i) => sum + Number(digit) * (7 - i), 0) % 10 !== Number(value[6]))) continue;
    if (type === 'mmsi' && value.length !== 9) continue;
    result.push({ id: `${type}:${value}`, label: `${type.toUpperCase()} ${value}`, type, method: 'identifier' });
  }
  // Require an explicit identifier label; do not guess people, callsigns or registrations.
  for (const match of text.matchAll(/\b(?:ICAO24|HEX)\s*[:#]?\s*([0-9a-f]{6})\b/gi)) result.push({ id: `aircraft:${match[1].toUpperCase()}`, label: `ICAO24 ${match[1].toUpperCase()}`, type: 'aircraft', method: 'identifier' });
  return [...new Map(result.map(entity => [entity.id, entity])).values()];
}
export function correlateEntities(items: NewsItem[]) {
  const linked = new Map<string, { entity: ExtractedEntity; articleIds: string[]; publishers: Set<string> }>();
  for (const item of items) for (const entity of extractEntities(`${item.title} ${item.description}`)) {
    const record = linked.get(entity.id) ?? { entity, articleIds: [], publishers: new Set<string>() };
    record.articleIds.push(item.id); record.publishers.add(item.source); linked.set(entity.id, record);
  }
  return [...linked.values()].map(record => ({ ...record, articleIds: [...new Set(record.articleIds)], publishers: [...record.publishers].sort() }));
}

export type SignalType = 'seismic' | 'fire' | 'aviation' | 'maritime' | 'news' | 'outage' | 'gnss';
export interface ConvergenceSignal { id: string; type: SignalType; source: string; independenceKey: string; trust: SourceTrust; time: string; lat: number; lng: number; title: string; url: string }
export const SIGNAL_WEIGHTS: Record<SignalType, number> = { seismic: 20, fire: 15, aviation: 15, maritime: 15, news: 10, outage: 20, gnss: 15 };
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlng = (b.lng - a.lng) * rad;
  const hav = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(hav)));
}
export function detectConvergence(signals: ConvergenceSignal[], options: { radiusKm?: number; windowHours?: number; minimumTypes?: number; minimumScore?: number; minimumTrust?: TrustTier; now?: number } = {}) {
  const { radiusKm = 50, windowHours = 6, minimumTypes = 3, minimumScore = 40, minimumTrust = 'established_media', now = Date.now() } = options;
  if (!(radiusKm > 0 && radiusKm <= 1000 && windowHours > 0 && windowHours <= 168 && Number.isInteger(minimumTypes) && minimumTypes >= 2 && minimumTypes <= 7 && minimumScore >= 0 && minimumScore <= 100)) throw new Error('Invalid convergence configuration.');
  const unique = new Map<string, ConvergenceSignal>();
  for (const signal of signals) {
    const time = Date.parse(signal.time);
    if (!Number.isFinite(time) || time > now || time < now - windowHours * 3600000 || !Number.isFinite(signal.lat) || !Number.isFinite(signal.lng) || Math.abs(signal.lat) > 90 || Math.abs(signal.lng) > 180 || !meetsTrust(signal.trust, minimumTrust) || !signal.independenceKey || signal.independenceKey === 'unreviewed') continue;
    const identity = `${signal.source}:${signal.id}`;
    if (!unique.has(identity)) unique.set(identity, signal);
  }
  const sorted = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
  const alerts = [], seen = new Set<string>();
  for (const anchor of sorted) {
    const contributions = sorted.filter(signal => distanceKm(anchor, signal) <= radiusKm && Math.abs(Date.parse(signal.time) - Date.parse(anchor.time)) <= windowHours * 3600000);
    // One publisher/operator can contribute one source type to the score. Reprints
    // and multiple reports from the same operator cannot manufacture corroboration.
    const byOperator = new Map<string, ConvergenceSignal>();
    for (const signal of contributions) if (!byOperator.has(signal.independenceKey)) byOperator.set(signal.independenceKey, signal);
    const types = [...new Set([...byOperator.values()].map(signal => signal.type))];
    const score = Math.min(100, types.reduce((sum, type) => sum + SIGNAL_WEIGHTS[type], 0));
    const id = contributions.map(signal => `${signal.source}:${signal.id}`).sort().join('|');
    if (types.length < minimumTypes || score < minimumScore || seen.has(id)) continue;
    seen.add(id); alerts.push({ id, anchor: { lat: anchor.lat, lng: anchor.lng }, score, types, contributions,
      scoredSignals: [...byOperator.values()].map(signal => ({ id: signal.id, independenceKey: signal.independenceKey, type: signal.type })),
      label: 'Indicative geographic convergence; proximity does not establish a shared cause.', radiusKm, windowHours, minimumTrust });
  }
  return alerts;
}

export function whyItMatters(item: Pick<NewsItem, 'title' | 'description'>) {
  const entities = extractEntities(`${item.title} ${item.description}`);
  const assets = entities.filter(entity => ['place', 'port', 'airport'].includes(entity.type));
  return { label: 'Rule-based context · INFERENCE', text: assets.length
    ? `Reports mention ${assets.map(entity => entity.label).join(', ')}. Review nearby routes and infrastructure against the source evidence; a mention does not establish a closure or operational impact.`
    : 'Review the source for affected regions and operational assets. This report alone does not establish exposure or disruption.', entities };
}
