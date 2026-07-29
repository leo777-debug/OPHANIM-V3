export type WarSanctionsCatalogue = 'ships' | 'shadow-fleet';

export interface WarSanctionsPort {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface WarSanctionsVessel {
  id: string;
  name: string;
  imo?: string;
  mmsi?: string;
  flag?: string;
  vesselType?: string;
  category?: string;
  summary?: string;
  sourceUrl: string;
  isShadowFleet: boolean;
  ports: WarSanctionsPort[];
}

const BASE_URL = 'https://war-sanctions.gur.gov.ua/en/transport';
const CACHE_TTL_MS = 15 * 60 * 1000;
const listCache = new Map<string, { expiresAt: number; value: WarSanctionsVessel[] }>();
const profileCache = new Map<string, { expiresAt: number; value: WarSanctionsVessel }>();

function decode(value: string | undefined): string {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string): T | null {
  const item = cache.get(key);
  return item && item.expiresAt > Date.now() ? item.value : null;
}

function cache<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T): T {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function fetchPublicPage(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'Ophanim/1.0 (public-source attribution)' },
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`War & Sanctions returned ${response.status}`);
  return response.text();
}

function field(card: string, label: string): string | undefined {
  const pattern = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</div>\\s*<div[^>]*>([\\s\\S]*?)</div>`, 'i');
  const value = decode(card.match(pattern)?.[1]);
  return value || undefined;
}

function parseList(html: string, catalogue: WarSanctionsCatalogue): WarSanctionsVessel[] {
  const matches = html.matchAll(/<a[^>]+href=["']https:\/\/war-sanctions\.gur\.gov\.ua\/en\/transport\/(?:ships|shadow-fleet)\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  const vessels = new Map<string, WarSanctionsVessel>();
  for (const match of matches) {
    const id = match[1];
    const card = match[2];
    const name = field(card, 'Vessel name');
    if (!name) continue;
    vessels.set(id, {
      id,
      name,
      imo: field(card, 'IMO'),
      flag: field(card, 'Flag (Current)'),
      vesselType: field(card, 'Vessel Type'),
      category: field(card, 'Category'),
      summary: decode(card.match(/long-text-multiline[^>]*>([\s\S]*?)<\/div>/i)?.[1]),
      sourceUrl: `${BASE_URL}/${catalogue}/${id}`,
      isShadowFleet: catalogue === 'shadow-fleet',
      ports: [],
    });
  }
  return [...vessels.values()];
}

function parsePorts(html: string): WarSanctionsPort[] {
  const widget = html.match(/MapLibreWidget\s*=\s*(\{[\s\S]*?\});<\/script>/)?.[1];
  if (!widget) return [];
  try {
    const data = JSON.parse(widget) as { geodata?: Array<{ id?: number; title?: string; lat?: number; lng?: number }> };
    return (data.geodata ?? [])
      .filter((item) => typeof item.title === 'string' && Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .map((item) => ({ id: String(item.id ?? `${item.lat},${item.lng}`), name: item.title!, lat: item.lat!, lng: item.lng! }));
  } catch {
    return [];
  }
}

function parseProfile(html: string, id: string): WarSanctionsVessel {
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? `${BASE_URL}/ships/${id}`;
  const title = decode(html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1]);
  const name = title.replace(/;\s*IMO\s*\d{7}$/i, '') || `Vessel ${id}`;
  const imo = title.match(/IMO\s*(\d{7})/i)?.[1] ?? field(html, 'IMO');
  const mmsi = html.match(/MMSI\D{0,180}?(\d{9})/i)?.[1];
  return {
    id,
    name,
    imo,
    mmsi,
    flag: field(html, 'Flag (Current)'),
    vesselType: field(html, 'Vessel Type'),
    category: field(html, 'Category'),
    summary: decode(html.match(/long-text-multiline[^>]*>([\s\S]*?)<\/div>/i)?.[1]),
    sourceUrl: canonical,
    isShadowFleet: /\/shadow-fleet\//i.test(canonical),
    ports: parsePorts(html),
  };
}

export async function findWarSanctionsVessels(query: string, signal?: AbortSignal): Promise<WarSanctionsVessel[]> {
  const normalized = query.trim();
  const results = await Promise.all((['ships', 'shadow-fleet'] as const).map(async (catalogue) => {
    const url = new URL(`${BASE_URL}/${catalogue}`);
    if (normalized) url.searchParams.set('f[search]', normalized);
    const key = url.toString();
    const existing = cached(listCache, key);
    if (existing) return existing;
    return cache(listCache, key, parseList(await fetchPublicPage(key, signal), catalogue));
  }));
  const byId = new Map<string, WarSanctionsVessel>();
  for (const vessel of results.flat()) byId.set(vessel.id, vessel);
  return [...byId.values()];
}

export async function getWarSanctionsVessel(id: string, signal?: AbortSignal): Promise<WarSanctionsVessel> {
  if (!/^\d+$/.test(id)) throw new Error('Invalid War & Sanctions vessel id');
  const existing = cached(profileCache, id);
  if (existing) return existing;
  const html = await fetchPublicPage(`${BASE_URL}/ships/${id}`, signal);
  return cache(profileCache, id, parseProfile(html, id));
}

export async function getWarSanctionsMapVessels(catalogue: WarSanctionsCatalogue, signal?: AbortSignal): Promise<WarSanctionsVessel[]> {
  const list = await findWarSanctionsVessels('', signal);
  const selected = list.filter((vessel) => vessel.isShadowFleet === (catalogue === 'shadow-fleet')).slice(0, 12);
  return Promise.all(selected.map((vessel) => getWarSanctionsVessel(vessel.id, signal)));
}
