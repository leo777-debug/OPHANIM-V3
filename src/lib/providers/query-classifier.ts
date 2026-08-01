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

function isValidImo(value: string): boolean {
  if (!/^\d{7}$/.test(value)) return false;
  const checksum = value.slice(0, 6).split('').reduce((total, digit, index) => total + Number(digit) * (7 - index), 0) % 10;
  return checksum === Number(value[6]);
}

function classifyCommand(query: string): ProviderQuery | null {
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const commands: Array<[RegExp, ProviderQuery['command']]> = [
    [/^show (the )?submarine cables?$/, 'show_submarine_cables'],
    [/^show (the )?ghost ships?$/, 'show_ghost_ships'],
    [/^show (the )?sanctioned vessels?$/, 'show_sanctioned_vessels'],
    [/^show (the )?ai data cent(er|re)s?$/, 'show_ai_data_centers'],
  ];
  const match = commands.find(([pattern]) => pattern.test(normalized));
  if (!match) return null;
  return { intent: 'map_command', entityType: 'command', query, command: match[1], limit: 1 };
}

function classifyDarkWebQuery(query: string, limit: number): ProviderQuery | null {
  const match = query.match(/^(?:(?:search|find|show)\s+(?:the\s+)?(?:dark\s*web|darkweb)(?:\s+(?:mentions?|intel(?:ligence)?))?|(?:dark\s*web|darkweb)\s+(?:mentions?|intel(?:ligence)?))\s*(?:(?:for|of|about)\s+)?(.+)$/i);
  const subject = match?.[1]?.trim();
  if (!subject) return null;
  return { intent: 'dark_web_lookup', entityType: 'command', query: subject, limit };
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

  const command = classifyCommand(query);
  if (command) return command;

  const darkWebQuery = classifyDarkWebQuery(query, limit);
  if (darkWebQuery) return darkWebQuery;

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query)) {
    return { intent: 'email_lookup', entityType: 'email', query: query.toLowerCase(), limit: 1 };
  }
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(query) || (/^[0-9a-fA-F:]{2,}$/.test(query) && query.includes(':'))) {
    return { intent: 'ip_lookup', entityType: 'ip', query, limit: 1 };
  }
  if (isValidImo(query)) {
    return { intent: 'imo_lookup', entityType: 'imo', query, limit: 1 };
  }
  if (/^\d{9}$/.test(query)) {
    return { intent: 'mmsi_lookup', entityType: 'mmsi', query, limit: 1 };
  }
  if (/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(query)) {
    return { intent: 'domain_lookup', entityType: 'domain', query: query.toLowerCase(), limit: 1 };
  }
  if (/^@[a-zA-Z0-9-]{1,39}$/.test(query)) {
    return { intent: 'username_lookup', entityType: 'username', query: query.slice(1), limit: 1 };
  }

  const imoPrefix = query.match(/^imo\s*[:\-]?\s*(\d{7})$/i);
  if (imoPrefix && isValidImo(imoPrefix[1])) {
    return { intent: 'imo_lookup', entityType: 'imo', query: imoPrefix[1], limit: 1 };
  }
  const mmsiPrefix = query.match(/^mmsi\s*[:\-]?\s*(\d{9})$/i);
  if (mmsiPrefix) {
    return { intent: 'mmsi_lookup', entityType: 'mmsi', query: mmsiPrefix[1], limit: 1 };
  }

  const prefixed = query.match(/^(company|organization|organisation|org|person|individual|vessel|ship|port|country|region)\s*[:\-]?\s+(.+)$/i);
  if (prefixed) {
    const [, kind, value] = prefixed;
    const normalizedKind = kind.toLowerCase();
    const mapping: Record<string, Pick<ProviderQuery, 'intent' | 'entityType'>> = {
      company: { intent: 'company_lookup', entityType: 'company' },
      organization: { intent: 'organization_lookup', entityType: 'organization' },
      organisation: { intent: 'organization_lookup', entityType: 'organization' },
      org: { intent: 'organization_lookup', entityType: 'organization' },
      person: { intent: 'person_lookup', entityType: 'person' },
      individual: { intent: 'person_lookup', entityType: 'person' },
      vessel: { intent: 'vessel_lookup', entityType: 'vessel' },
      ship: { intent: 'vessel_lookup', entityType: 'vessel' },
      port: { intent: 'port_lookup', entityType: 'port' },
      country: { intent: 'country_lookup', entityType: 'country' },
      region: { intent: 'region_lookup', entityType: 'region' },
    };
    return { ...mapping[normalizedKind], query: value.trim(), limit };
  }

  const track = query.match(/^track\s+(.+)$/i);
  if (track) return { intent: 'vessel_lookup', entityType: 'vessel', query: track[1].trim(), limit };

  if (/^(show|find|locate)\s+/i.test(query)) {
    return { intent: 'natural_language', entityType: 'command', query, command: 'unsupported_natural_language', limit: 1 };
  }

  if (query.length < 2) throw new Error('Search query must be at least 2 characters');
  return { intent: 'forward_geocode', entityType: 'location', query, limit };
}
