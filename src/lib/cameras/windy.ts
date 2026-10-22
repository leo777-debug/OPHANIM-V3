import type { CctvCamera } from '@/app/api/cctv/types';
import { CAMERA_REGIONS, GCC_COUNTRIES, type CameraRegion } from './regions';

export interface CameraIndexQuery { region: CameraRegion; country?: string; continent?: string; offset: number; nearby?: [number, number, number] }
export interface CameraIndexResult {
  cameras: CctvCamera[];
  total: number;
  offset: number;
  nextOffset: number | null;
  status: 'ok' | 'not_configured' | 'unavailable' | 'partial';
  message: string;
}
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' ? value as RecordValue : {};
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const cache = new Map<string, { value: CameraIndexResult; expires: number }>();
const pending = new Map<string, Promise<CameraIndexResult>>();
const LIMIT = 50;
const TTL = 4 * 60 * 1000;

function windyUrl(value: unknown): string | undefined {
  try {
    const url = new URL(string(value));
    if (url.protocol === 'https:' && (url.hostname === 'windy.com' || url.hostname.endsWith('.windy.com')) && !url.username && !url.password) return url.href;
  } catch { /* Missing or invalid publisher URL. */ }
}

export function normalizeWindyCamera(value: unknown): CctvCamera | null {
  const cam = record(value), location = record(cam.location);
  const lat = location.latitude, lng = location.longitude;
  if (cam.status !== 'active' || !Number.isSafeInteger(cam.webcamId) || Number(cam.webcamId) <= 0
    || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const live = windyUrl(record(cam.player).live);
  const detail = windyUrl(record(cam.urls).detail) ?? `https://www.windy.com/webcams/${cam.webcamId}`;
  return {
    id: `windy-${cam.webcamId}`, lat, lng, name: string(cam.title) || 'Published webcam',
    city: string(location.city), country: string(location.country) || string(location.country_code),
    country_code: string(location.country_code), source: 'Windy Webcams', external_url: detail,
    ...(live ? { stream_url: live, stream_type: 'iframe' as const } : {}),
    observation_time: string(cam.lastUpdatedOn) || undefined,
    media_kind: live ? 'live' : 'publisher_page',
  };
}

export function parseCameraIndexQuery(params: URLSearchParams): CameraIndexQuery {
  const region = params.get('region') ?? 'worldwide';
  if (!Object.hasOwn(CAMERA_REGIONS, region)) throw new Error('Unknown camera region.');
  const country = params.get('country')?.toUpperCase() || undefined;
  if (country && !/^[A-Z]{2}$/.test(country)) throw new Error('Country must be a two-letter ISO code.');
  const rawOffset = params.get('offset') ?? '0';
  if (!/^\d+$/.test(rawOffset) || Number(rawOffset) > 10000) throw new Error('Offset must be between 0 and 10000.');
  const query: CameraIndexQuery = { region: region as CameraRegion, country, offset: Number(rawOffset) };
  if (['lat', 'lng', 'radius'].some(name => params.has(name))) {
    const values = ['lat', 'lng', 'radius'].map(name => {
      const value = params.get(name);
      return value === null || value.trim() === '' ? NaN : Number(value);
    });
    const [lat, lng, radius] = values;
    if (!values.every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || radius <= 0 || radius > 250) throw new Error('Provide valid lat, lng, and radius (1–250 km).');
    query.nearby = [lat, lng, radius];
  }
  if (country && region !== 'worldwide' && !(CAMERA_REGIONS[region as CameraRegion].countries as readonly string[]).includes(country)) throw new Error('Country is outside the selected region.');
  return query;
}

async function page(params: URLSearchParams, key: string): Promise<{ cameras: CctvCamera[]; total: number; nextOffset: number | null }> {
  const response = await fetch(`https://api.windy.com/webcams/api/v3/webcams?${params}`, {
    headers: { 'x-windy-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  if (!response.ok) throw new Error('Webcam provider unavailable.');
  const body = record(await response.json());
  if (!Array.isArray(body.webcams) || typeof body.total !== 'number' || !Number.isSafeInteger(body.total) || body.total < 0) throw new Error('Invalid webcam provider response.');
  const offset = Number(params.get('offset') ?? 0);
  return { cameras: body.webcams.map(normalizeWindyCamera).filter((cam): cam is CctvCamera => cam !== null), total: body.total,
    nextOffset: body.webcams.length > 0 && offset + LIMIT < body.total ? offset + LIMIT : null };
}

export async function searchCameraIndex(query: CameraIndexQuery): Promise<CameraIndexResult> {
  const key = process.env.WINDY_WEBCAMS_API_KEY?.trim();
  const empty = { cameras: [], total: 0, offset: query.offset, nextOffset: null };
  if (!key) return { ...empty, status: 'not_configured', message: 'Worldwide public webcam discovery needs WINDY_WEBCAMS_API_KEY. Existing transport cameras remain available.' };
  const cacheKey = JSON.stringify(query);
  const saved = cache.get(cacheKey);
  if (saved && saved.expires > Date.now()) return saved.value;
  const active = pending.get(cacheKey);
  if (active) return active;
  // Avoid unbounded concurrent outbound requests from arbitrary viewport queries.
  if (pending.size >= 8) return { ...empty, status: 'unavailable', message: 'Camera discovery is busy. Retry shortly.' };
  const request = (async (): Promise<CameraIndexResult> => {
    try {
      const countries = query.country ? [query.country] : CAMERA_REGIONS[query.region].countries;
      const groups: string[][] = [];
      for (let i = 0; i < countries.length; i += 10) groups.push(countries.slice(i, i + 10));
      if (!groups.length) groups.push([]);
      const results = await Promise.allSettled(groups.map(group => {
        const params = new URLSearchParams({ include: 'location,player,urls', limit: String(LIMIT), offset: String(query.offset) });
        if (group.length) params.set('countries', group.join(','));
        if (query.continent) params.set('continents', query.continent);
        if (query.nearby) params.set('nearby', query.nearby.join(','));
        return page(params, key);
      }));
      const pages = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      if (!pages.length) return { ...empty, status: 'unavailable', message: 'Windy is unavailable or rejected the API key. Check the integration connection.' };
      const partial = pages.length < results.length;
      const value: CameraIndexResult = {
        cameras: Array.from(new Map(pages.flatMap(value => value.cameras).map(cam => [cam.id, cam])).values()),
        total: pages.reduce((sum, value) => sum + value.total, 0), offset: query.offset,
        nextOffset: pages.some(value => value.nextOffset !== null) ? query.offset + LIMIT : null,
        status: partial ? 'partial' : 'ok',
        message: partial ? 'Some country groups failed. Counts show successful groups only; retry this page.' : 'Published webcams only. Availability varies; a worldwide index does not imply cameras in every country.',
      };
      // Failed groups must be retried, not cached as successful coverage.
      if (!partial) {
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { value, expires: Date.now() + TTL });
      }
      return value;
    } catch {
      return { ...empty, status: 'unavailable', message: 'Camera discovery failed. Retry shortly.' };
    }
  })();
  pending.set(cacheKey, request);
  try { return await request; } finally { pending.delete(cacheKey); }
}

/** Balanced, bounded overview; country searches and viewport queries load more. */
export async function globalCameraOverview(): Promise<CameraIndexResult> {
  if (!process.env.WINDY_WEBCAMS_API_KEY?.trim()) return searchCameraIndex({ region: 'worldwide', offset: 0 });
  const priority: CameraIndexQuery[] = [...GCC_COUNTRIES.map(country => ({ region: 'gcc' as const, country, offset: 0 })),
    { region: 'mena', offset: 0 },
    ...['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'].map(continent => ({ region: 'worldwide' as const, continent, offset: 0 }))];
  const results: CameraIndexResult[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < priority.length) results.push(await searchCameraIndex(priority[next++]));
  }));
  const cameras = Array.from(new Map(results.flatMap(result => result.cameras).map(cam => [cam.id, cam])).values());
  return { cameras, total: cameras.length, offset: 0, nextOffset: null,
    status: results.every(result => result.status === 'unavailable') ? 'unavailable' : results.every(result => result.status === 'ok') ? 'ok' : 'partial',
    message: 'Sampled worldwide overview prioritizes all six GCC countries and MENA. Use Cameras country search or move the map to load more. Coverage depends on publisher availability.' };
}
