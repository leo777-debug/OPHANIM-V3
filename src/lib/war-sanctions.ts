export type WarSanctionsCatalogue = 'ships' | 'shadow-fleet';

export interface WarSanctionsPort {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface WarSanctionsVessel {
  id: string;
  catalogue: WarSanctionsCatalogue;
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

export type WarSanctionsPublicCatalogue =
  | 'sanctions-persons'
  | 'sanctions-companies'
  | 'component-companies'
  | 'uav-companies'
  | 'rostec'
  | 'executives'
  | 'scientists'
  | 'kidnappers'
  | 'propaganda'
  | 'sports';

export interface WarSanctionsPublicEntity {
  id: string;
  catalogue: WarSanctionsPublicCatalogue;
  label: string;
  entityType: 'person' | 'company' | 'organization';
  sourceUrl: string;
  summary?: string;
}

const BASE_URL = 'https://war-sanctions.gur.gov.ua/en/transport';
const PUBLIC_BASE_URL = 'https://war-sanctions.gur.gov.ua/en';
const CACHE_TTL_MS = 15 * 60 * 1000;
const listCache = new Map<string, { expiresAt: number; value: WarSanctionsVessel[] }>();
const profileCache = new Map<string, { expiresAt: number; value: WarSanctionsVessel }>();
const publicEntityCache = new Map<string, { expiresAt: number; value: WarSanctionsPublicEntity[] }>();
const publicProfileCache = new Map<string, { expiresAt: number; value: WarSanctionsPublicEntity }>();

const PUBLIC_CATALOGUES: Record<WarSanctionsPublicCatalogue, {
  path: string;
  entityType: WarSanctionsPublicEntity['entityType'];
  label: string;
}> = {
  'sanctions-persons': { path: 'sanctions/persons', entityType: 'person', label: 'Sanctioned person' },
  'sanctions-companies': { path: 'sanctions/companies', entityType: 'company', label: 'Sanctioned company' },
  'component-companies': { path: 'components/companies', entityType: 'company', label: 'Weapon component company' },
  'uav-companies': { path: 'uav/companies', entityType: 'company', label: 'UAV company' },
  rostec: { path: 'rostec', entityType: 'organization', label: 'Rostec entity' },
  executives: { path: 'executives', entityType: 'person', label: 'Executive' },
  scientists: { path: 'scientists/persons', entityType: 'person', label: 'Scientist' },
  kidnappers: { path: 'kidnappers/persons', entityType: 'person', label: 'Abductor' },
  propaganda: { path: 'propaganda/persons', entityType: 'person', label: 'Propaganda actor' },
  sports: { path: 'sport/persons', entityType: 'person', label: 'Sport-linked person' },
};

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
      catalogue,
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

function publicEntityName(card: string): string | undefined {
  const labelled = field(card, 'Name') ?? field(card, 'Full name');
  if (labelled) return labelled;
  const bold = decode(card.match(/class=["'][^"']*font-weight-bold[^"']*["'][^>]*>\s*([^<]+)/i)?.[1]);
  if (bold) return bold;
  const imageAlt = decode(card.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1]);
  return imageAlt || undefined;
}

function parsePublicList(html: string, catalogue: WarSanctionsPublicCatalogue): WarSanctionsPublicEntity[] {
  const definition = PUBLIC_CATALOGUES[catalogue];
  const escapedPath = definition.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<a[^>]+href=["']https:\\/\\/war-sanctions\\.gur\\.gov\\.ua\\/en\\/${escapedPath}\\/(\\d+)["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  const entries = new Map<string, WarSanctionsPublicEntity>();
  for (const match of html.matchAll(pattern)) {
    const label = publicEntityName(match[2]);
    if (!label) continue;
    entries.set(match[1], {
      id: match[1], catalogue, label, entityType: definition.entityType,
      sourceUrl: `${PUBLIC_BASE_URL}/${definition.path}/${match[1]}`,
      summary: definition.label,
    });
  }
  return [...entries.values()];
}

function parsePublicProfile(html: string, catalogue: WarSanctionsPublicCatalogue, id: string): WarSanctionsPublicEntity {
  const definition = PUBLIC_CATALOGUES[catalogue];
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? `${PUBLIC_BASE_URL}/${definition.path}/${id}`;
  const title = decode(html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1])
    || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const summary = decode(html.match(/name=["']description["']\s+content=["']([^"']+)["']/i)?.[1])
    || decode(html.match(/long-text-multiline[^>]*>([\s\S]*?)<\/div>/i)?.[1])
    || definition.label;
  return { id, catalogue, label: title || `${definition.label} ${id}`, entityType: definition.entityType, sourceUrl: canonical, summary };
}

function parseProfile(html: string, id: string, catalogue: WarSanctionsCatalogue): WarSanctionsVessel {
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? `${BASE_URL}/${catalogue}/${id}`;
  const title = decode(html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1]);
  const name = title.replace(/;\s*IMO\s*\d{7}$/i, '') || `Vessel ${id}`;
  const imo = title.match(/IMO\s*(\d{7})/i)?.[1] ?? field(html, 'IMO');
  const mmsi = html.match(/MMSI\D{0,180}?(\d{9})/i)?.[1];
  return {
    id,
    catalogue: /\/shadow-fleet\//i.test(canonical) ? 'shadow-fleet' : catalogue,
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

export async function getWarSanctionsVessel(
  id: string,
  catalogue: WarSanctionsCatalogue = 'ships',
  signal?: AbortSignal,
): Promise<WarSanctionsVessel> {
  if (!/^\d+$/.test(id)) throw new Error('Invalid War & Sanctions vessel id');
  const cacheKey = `${catalogue}:${id}`;
  const existing = cached(profileCache, cacheKey);
  if (existing) return existing;
  const html = await fetchPublicPage(`${BASE_URL}/${catalogue}/${id}`, signal);
  return cache(profileCache, cacheKey, parseProfile(html, id, catalogue));
}

export async function getWarSanctionsMapVessels(catalogue: WarSanctionsCatalogue, signal?: AbortSignal): Promise<WarSanctionsVessel[]> {
  const list = await findWarSanctionsVessels('', signal);
  const selected = list.filter((vessel) => vessel.isShadowFleet === (catalogue === 'shadow-fleet')).slice(0, 12);
  return Promise.all(selected.map((vessel) => getWarSanctionsVessel(vessel.id, vessel.catalogue, signal)));
}

export function getWarSanctionsPublicCatalogues(entityType: WarSanctionsPublicEntity['entityType']): WarSanctionsPublicCatalogue[] {
  return (Object.keys(PUBLIC_CATALOGUES) as WarSanctionsPublicCatalogue[])
    .filter((catalogue) => PUBLIC_CATALOGUES[catalogue].entityType === entityType);
}

export async function findWarSanctionsPublicEntities(
  query: string,
  entityType: WarSanctionsPublicEntity['entityType'],
  signal?: AbortSignal,
): Promise<WarSanctionsPublicEntity[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const catalogues = getWarSanctionsPublicCatalogues(entityType);
  const groups = await Promise.all(catalogues.map(async (catalogue) => {
    const definition = PUBLIC_CATALOGUES[catalogue];
    const url = new URL(`${PUBLIC_BASE_URL}/${definition.path}`);
    url.searchParams.set('f[search]', normalized);
    const key = url.toString();
    const existing = cached(publicEntityCache, key);
    if (existing) return existing;
    return cache(publicEntityCache, key, parsePublicList(await fetchPublicPage(key, signal), catalogue));
  }));
  const normalizedNeedle = normalized.toLocaleLowerCase();
  return groups.flat().filter((entity) => entity.label.toLocaleLowerCase().includes(normalizedNeedle));
}

export async function getWarSanctionsPublicEntity(
  catalogue: WarSanctionsPublicCatalogue,
  id: string,
  signal?: AbortSignal,
): Promise<WarSanctionsPublicEntity> {
  if (!PUBLIC_CATALOGUES[catalogue] || !/^\d+$/.test(id)) throw new Error('Invalid War & Sanctions public entity');
  const cacheKey = `${catalogue}:${id}`;
  const existing = cached(publicProfileCache, cacheKey);
  if (existing) return existing;
  const html = await fetchPublicPage(`${PUBLIC_BASE_URL}/${PUBLIC_CATALOGUES[catalogue].path}/${id}`, signal);
  return cache(publicProfileCache, cacheKey, parsePublicProfile(html, catalogue, id));
}
