import type { Coordinates, ProviderQuery } from './types';

export interface SearchInput {
  query?: string | null;
  lat?: string | null;
  lng?: string | null;
  limit?: string | null;
  mode?: string | null;
}

function parseCoordinates(value: string): Coordinates | null {
  const match = value.trim().match(/^([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return isValidCoordinates(lat, lng) ? { lat, lng } : null;
}

function isValidCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parseLimit(value?: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(Math.floor(parsed), 1), 20);
}

export function classifySearch(input: SearchInput): ProviderQuery {
  const limit = parseLimit(input.limit);
  if (input.mode === 'reverse') {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (!isValidCoordinates(lat, lng)) throw new Error('Invalid reverse-geocode coordinates');
    return {
      intent: 'reverse_geocode',
      entityType: 'location',
      coordinates: { lat, lng },
      limit: 1,
    };
  }

  const query = input.query?.trim() ?? '';
  if (!query || query.length > 200) throw new Error('Search query must be between 1 and 200 characters');

  const coordinates = parseCoordinates(query);
  if (coordinates) {
    return {
      intent: 'coordinate_lookup',
      entityType: 'coordinate',
      coordinates,
      limit: 1,
    };
  }

  if (query.length < 2) throw new Error('Search query must be at least 2 characters');
  return { intent: 'forward_geocode', entityType: 'location', query, limit };
}
