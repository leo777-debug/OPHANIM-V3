import { safeFetch } from '@/lib/ssrf-guard';
import type { NormalizedSearchResult, Provider, ProviderQuery } from '../types';

interface NominatimRecord {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  class?: string;
  importance?: number;
  boundingbox?: string[];
  address?: Record<string, string>;
}

function zoomFor(type: string, category: string, boundingBox?: string[]): number {
  if (boundingBox?.length === 4) {
    const latSpan = Math.abs(Number(boundingBox[1]) - Number(boundingBox[0]));
    const lngSpan = Math.abs(Number(boundingBox[3]) - Number(boundingBox[2]));
    const span = Math.max(latSpan, lngSpan);
    if (span < 0.002) return 19;
    if (span < 0.01) return 17;
    if (span < 0.05) return 15;
    if (span < 0.2) return 13;
    if (span < 1) return 11;
    if (span < 5) return 8;
    if (span < 20) return 6;
    return 4;
  }

  if (['house', 'building', 'address', 'shop', 'amenity', 'office'].includes(type) || category === 'building') return 18;
  if (['road', 'street', 'highway', 'path', 'residential', 'tertiary', 'secondary', 'primary'].includes(type) || category === 'highway') return 17;
  if (['neighbourhood', 'quarter', 'suburb', 'hamlet', 'isolated_dwelling'].includes(type)) return 15;
  if (['village', 'town', 'borough'].includes(type)) return 14;
  if (['city', 'municipality'].includes(type)) return 12;
  if (['county', 'state_district', 'state', 'province'].includes(type) || category === 'boundary') return 8;
  if (type === 'country') return 5;
  if (type === 'continent') return 3;
  return 13;
}

function normalizeRecord(record: NominatimRecord): NormalizedSearchResult | null {
  const lat = Number(record.lat);
  const lng = Number(record.lon);
  if (!record.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const type = record.type || 'unknown';
  const category = record.class || 'unknown';
  const address = record.address || {};
  return {
    id: `nominatim:${record.place_id ?? `${lat},${lng}`}`,
    label: record.display_name,
    lat,
    lng,
    type,
    category,
    importance: record.importance ?? 0,
    zoomLevel: zoomFor(type, category, record.boundingbox),
    provider: 'nominatim',
    location: {
      locality: address.city || address.town || address.village || address.county,
      region: address.state || address.region,
      country: address.country,
    },
  };
}

export const nominatimProvider: Provider = {
  metadata: {
    id: 'nominatim', name: 'nominatim', category: 'geospatial',
    description: 'OpenStreetMap geocoding and reverse-geocoding service.',
    supportedEntityTypes: ['location', 'port', 'country', 'region'],
    supportedIntents: ['forward_geocode', 'reverse_geocode', 'port_lookup', 'country_lookup', 'region_lookup'],
    supportsMapLayers: false,
    requiresCredentials: false,
    timeoutMs: 5000,
    enabled: process.env.OPHANIM_NOMINATIM_ENABLED !== 'false',
    priority: 20,
  },

  async createMapLayers() { return []; },

  async execute(query, context) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    if (query.intent === 'reverse_geocode' && query.coordinates) {
      url.pathname = '/reverse';
      url.searchParams.set('lat', String(query.coordinates.lat));
      url.searchParams.set('lon', String(query.coordinates.lng));
      url.searchParams.set('zoom', '10');
    } else {
      url.searchParams.set('q', query.query ?? '');
      url.searchParams.set('limit', String(query.limit));
      url.searchParams.set('extratags', '1');
    }
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');

    const response = await safeFetch(url.toString(), {
      signal: context.signal,
      cache: 'no-store',
      headers: {
        'Accept-Language': context.locale,
        'User-Agent': 'OPHANIM-Intelligence-Atlas/1.0',
      },
    });
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
    return response.json();
  },

  normalize(raw, query) {
    const records = Array.isArray(raw) ? raw : [raw];
    const results = records
      .map((record) => normalizeRecord(record as NominatimRecord))
      .filter((record): record is NormalizedSearchResult => record !== null);
    return results.slice(0, query.limit);
  },
};
