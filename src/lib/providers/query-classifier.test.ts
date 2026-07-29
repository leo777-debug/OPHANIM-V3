import { describe, expect, it } from 'vitest';
import { classifySearch } from './query-classifier';

describe('classifySearch', () => {
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
});
