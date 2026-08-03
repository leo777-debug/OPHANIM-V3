import { describe, expect, it } from 'vitest';
import { classifySearch } from './query-classifier';

describe('classifySearch', () => {
  it('classifies War & Sanctions map commands deterministically', () => {
    expect(classifySearch({ query: 'Show ghost ships' })).toMatchObject({ command: 'show_ghost_ships', intent: 'map_command' });
    expect(classifySearch({ query: 'Show sanctioned vessels' })).toMatchObject({ command: 'show_sanctioned_vessels', intent: 'map_command' });
  });

  it('classifies explicit dark-web investigations without AI routing', () => {
    expect(classifySearch({ query: 'dark web mentions of MSC IRINA' })).toMatchObject({
      intent: 'dark_web_lookup', entityType: 'command', query: 'MSC IRINA',
    });
    expect(classifySearch({ query: 'search darkweb intelligence for LockBit' })).toMatchObject({
      intent: 'dark_web_lookup', entityType: 'command', query: 'LockBit',
    });
  });

  it('classifies valid coordinate input without selecting a provider', () => {
    expect(classifySearch({ query: '40.7128, -74.0060' })).toMatchObject({
      intent: 'coordinate_lookup',
      entityType: 'coordinate',
      coordinates: { lat: 40.7128, lng: -74.006 },
    });
  });

  it('classifies forward geocoding queries', () => {
    expect(classifySearch({ query: 'New York', limit: '8' })).toMatchObject({
      intent: 'forward_geocode',
      entityType: 'location',
      query: 'New York',
      limit: 8,
    });
  });

  it('validates reverse-geocoding coordinates', () => {
    expect(classifySearch({ mode: 'reverse', lat: '51.5072', lng: '-0.1276' })).toMatchObject({
      intent: 'reverse_geocode',
      entityType: 'location',
      coordinates: { lat: 51.5072, lng: -0.1276 },
    });
    expect(() => classifySearch({ mode: 'reverse', lat: '91', lng: '0' })).toThrow();
  });

  it.each([
    ['8.8.8.8', 'ip_lookup', 'ip'],
    ['tesla.com', 'domain_lookup', 'domain'],
    ['analyst@example.com', 'email_lookup', 'email'],
    ['@octocat', 'username_lookup', 'username'],
    ['company Tesla', 'company_lookup', 'company'],
    ['organization OpenAI', 'organization_lookup', 'organization'],
    ['person ZAHED Hossein Ghorbani', 'person_lookup', 'person'],
    ['Track MSC IRINA', 'vessel_lookup', 'vessel'],
    ['Port Singapore', 'port_lookup', 'port'],
    ['9074729', 'imo_lookup', 'imo'],
    ['123456789', 'mmsi_lookup', 'mmsi'],
    ['country France', 'country_lookup', 'country'],
    ['region Lombardy', 'region_lookup', 'region'],
    ['Show submarine cables', 'map_command', 'command'],
    ['Show ghost ships', 'map_command', 'command'],
    ['Show AI data centers', 'map_command', 'command'],
  ] as const)('classifies %s deterministically', (query, intent, entityType) => {
    expect(classifySearch({ query })).toMatchObject({ intent, entityType });
  });

  it('classifies unsupported natural language without AI routing', () => {
    expect(classifySearch({ query: 'Show unknown network assets' })).toMatchObject({
      intent: 'natural_language', entityType: 'command', command: 'unsupported_natural_language',
    });
  });
});
