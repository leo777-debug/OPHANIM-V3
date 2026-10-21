// Watchtower: public port cameras. Public, lawful OSINT only — feeds already
// published for public viewing, each with its source URL and terms. Nothing here
// scans, logs in, bypasses geofencing/paywalls/robots.txt or re-streams.
// Camera views are best-effort: an empty, stale or calm view is never an "all clear".
import catalog from './catalog.json' with { type: 'json' };
import { safeFetch } from '@/lib/ssrf-guard';

export const CAMERA_TYPES = ['port', 'traffic', 'marina', 'tourist', 'shop'] as const;
export const EMBED_TYPES = ['hls', 'youtube', 'mjpeg', 'iframe', 'snapshot'] as const;
export type CameraType = (typeof CAMERA_TYPES)[number];
export type EmbedType = (typeof EMBED_TYPES)[number];
export type FeedStatus = 'live' | 'stale' | 'dead' | 'unverified' | 'unknown';
/** The `camera` provider record. */
export type CameraFeed = {
  id: string; name: string; port: string; country: string; lat: number | null; lon: number | null; type: CameraType; streamUrl: string | null; embedType: EmbedType;
  sourceUrl: string; terms: string; lastSeen: string | null; status: FeedStatus; provider: 'catalogue' | 'windy'; distanceKm: number | null; note?: string;
};
export type Port = { code: string; name: string; country: string; lat: number; lon: number; aliases: string[]; radiusKm: number };
export type FeedHealth = { feedId: string; status: FeedStatus; lastSeen: string | null; lastChecked: string; failures: number; detail: string | null };

export const PORTS: Port[] = catalog.ports;
const norm = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Match "Fujairah anchorage", "Jebel Ali gate", a UN/LOCODE or an IATA-style code to the priority ports. */
export function searchPorts(query: string): Port[] {
  const needle = norm(query);
  if (!needle) return PORTS;
  const code = query.trim().toUpperCase();
  return PORTS.map(port => {
    const names = [port.name, ...port.aliases].map(norm);
    const score = port.code === code ? 3 : names.some(name => name === needle) ? 2 : names.some(name => name.includes(needle) || needle.includes(name)) ? 1 : 0;
    return { port, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.port);
}
export const portByCode = (code: string) => PORTS.find(port => port.code === code.toUpperCase());

/** Feeds from the curated catalogue, with their latest health. Dead feeds are kept but pruned from the default view. */
export function catalogueFeeds(port: Port, health: Map<string, FeedHealth>): CameraFeed[] {
  return (catalog.feeds as Array<Omit<CameraFeed, 'country' | 'lat' | 'lon' | 'lastSeen' | 'provider' | 'distanceKm'> & { lat?: number; lon?: number }>).filter(feed => feed.port === port.code).map(feed => {
    const checked = health.get(feed.id), position = feed.lat !== undefined && feed.lon !== undefined ? { lat: feed.lat, lon: feed.lon } : null;
    return { ...feed, country: port.country, lat: position?.lat ?? null, lon: position?.lon ?? null, provider: 'catalogue' as const, distanceKm: position ? distanceKm(port, position) : null,
      status: feed.status === 'unverified' ? 'unverified' : checked?.status ?? 'unknown', lastSeen: checked?.lastSeen ?? null };
  });
}

// ---- Windy Webcams API (public webcam aggregator; key required) -------------------
export const windyConfigured = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.WINDY_WEBCAMS_API_KEY);
type WindyCam = { webcamId?: number | string; title?: string; status?: string; lastUpdatedOn?: string; location?: { latitude?: number; longitude?: number }; player?: { day?: string; live?: string }; urls?: { detail?: string } };
/** Parses the v3 response defensively; verify the shape with a key before relying on it. */
export function parseWindy(body: unknown, port: Port): CameraFeed[] {
  const webcams = ((body as { webcams?: WindyCam[] })?.webcams ?? []).slice(0, 50);
  return webcams.flatMap(cam => {
    const lat = Number(cam.location?.latitude), lon = Number(cam.location?.longitude), player = cam.player?.live || cam.player?.day;
    if (!cam.webcamId || !player || !/^https:\/\//.test(player)) return [];
    const valid = Number.isFinite(lat) && Number.isFinite(lon);
    return [{ id: `windy-${cam.webcamId}`, name: String(cam.title ?? 'Public webcam').slice(0, 160), port: port.code, country: port.country, lat: valid ? lat : null, lon: valid ? lon : null, type: 'tourist' as const,
      streamUrl: player, embedType: 'iframe' as const, sourceUrl: cam.urls?.detail ?? 'https://www.windy.com/-Webcams/webcams', terms: 'Windy Webcams API terms: attribution and link required; publisher terms apply.',
      lastSeen: cam.lastUpdatedOn ?? null, status: cam.status === 'active' ? 'live' as const : 'stale' as const, provider: 'windy' as const, distanceKm: valid ? distanceKm(port, { lat, lon }) : null }];
  });
}
const windyCache = new Map<string, { at: number; feeds: CameraFeed[] }>();
export async function windyFeeds(port: Port, env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): Promise<CameraFeed[]> {
  if (!windyConfigured(env)) return [];
  const cached = windyCache.get(port.code);
  if (cached && Date.now() - cached.at < 15 * 60e3) return cached.feeds;
  const url = `https://api.windy.com/webcams/api/v3/webcams?nearby=${port.lat},${port.lon},${port.radiusKm}&include=location,player,urls&limit=50`;
  const response = await fetcher(url, { headers: { 'x-windy-api-key': env.WINDY_WEBCAMS_API_KEY! }, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Windy webcams unavailable (HTTP ${response.status}).`);
  const feeds = parseWindy(await response.json(), port);
  windyCache.set(port.code, { at: Date.now(), feeds });
  return feeds;
}

export type PortCameras = { port: Port; feeds: CameraFeed[]; live: number; warnings: string[] };
export async function camerasForPort(port: Port, health: Map<string, FeedHealth>, options: { includeDead?: boolean; windy?: typeof windyFeeds } = {}): Promise<PortCameras> {
  const warnings: string[] = [];
  let windy: CameraFeed[] = [];
  try { windy = await (options.windy ?? windyFeeds)(port); } catch (error) { warnings.push(error instanceof Error ? error.message : 'Webcam aggregator unavailable.'); }
  if (!windyConfigured() && !options.windy) warnings.push('Webcam aggregator not configured (WINDY_WEBCAMS_API_KEY). Showing the curated catalogue only.');
  const feeds = [...catalogueFeeds(port, health), ...windy].filter(feed => options.includeDead || feed.status !== 'dead')
    .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  const live = feeds.filter(feed => feed.status === 'live').length;
  if (!live) warnings.push('No live public view of this port right now. This is not an all-clear.');
  return { port, feeds, live, warnings };
}

// ---- Health check ------------------------------------------------------------------
/** Ping a verified public feed once. YouTube is checked via its public oEmbed endpoint; nothing is downloaded beyond headers/first bytes. */
export async function checkFeed(feed: Pick<CameraFeed, 'id' | 'streamUrl' | 'embedType'>, previous: FeedHealth | undefined, now = Date.now(), fetcher: (url: string, init: RequestInit) => Promise<Response> = safeFetch): Promise<FeedHealth> {
  const base = { feedId: feed.id, lastChecked: new Date(now).toISOString() };
  if (!feed.streamUrl) return { ...base, status: 'unverified', lastSeen: previous?.lastSeen ?? null, failures: 0, detail: 'No public stream URL recorded.' };
  const target = feed.embedType === 'youtube' ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(feed.streamUrl)}` : feed.streamUrl;
  try {
    const response = await fetcher(target, { method: feed.embedType === 'snapshot' || feed.embedType === 'mjpeg' || feed.embedType === 'youtube' ? 'GET' : 'HEAD', headers: { Range: 'bytes=0-1023', 'User-Agent': 'Ophanim-Watchtower-health/1 (public feed availability check)' }, signal: AbortSignal.timeout(8000) });
    await response.body?.cancel().catch(() => undefined);
    if (response.ok || response.status === 206) return { ...base, status: 'live', lastSeen: base.lastChecked, failures: 0, detail: null };
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    // Three failed checks in a row prune the feed from the default view; it is kept for audit.
    const failures = (previous?.failures ?? 0) + 1;
    return { ...base, status: failures >= 3 ? 'dead' : 'stale', lastSeen: previous?.lastSeen ?? null, failures, detail: error instanceof Error ? error.message.slice(0, 200) : 'check failed' };
  }
}
export const verifiedCatalogueFeeds = () => (catalog.feeds as Array<{ id: string; status: string; streamUrl: string | null; embedType: EmbedType }>).filter(feed => feed.status !== 'unverified' && feed.streamUrl);
export const CATALOGUE_POLICY = catalog.metadata;
