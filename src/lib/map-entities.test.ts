import { expect, it } from 'vitest';
import { mapEntity, searchMapEntities, supportsEntityEnrichment } from './map-entities';

it('uses source identifiers rather than display IDs for vessel and aircraft expansion', () => {
  expect(mapEntity({ provider: 'maritime', id: 'ais-1', mmsi: 123456789, name: 'Fixture vessel' })).toMatchObject({ type: 'vessel', id: '123456789' });
  expect(mapEntity({ provider: 'flights', id: 'flight-1', icao24: 'abc123' })).toMatchObject({ type: 'aircraft', id: 'abc123' });
  expect(mapEntity({ provider: 'cyber', id: 'indicator-1', ip: '192.0.2.1' })).toMatchObject({ type: 'ip', id: '192.0.2.1' });
});

it('only requests enrichment for types supported by the configured service', () => {
  expect(supportsEntityEnrichment('vessel')).toBe(true);
  expect(supportsEntityEnrichment('event')).toBe(false);
  expect(supportsEntityEnrichment('satellites')).toBe(false);
});

it('searches loaded observations without fabricating relationships or duplicate targets', () => {
  const vessel = { provider: 'maritime', id: 'v1', name: 'Fixture vessel', mmsi: '123456789' };
  expect(searchMapEntities([vessel, vessel], '123456')).toEqual([vessel]);
  expect(searchMapEntities([vessel], 'absent')).toEqual([]);
  expect(searchMapEntities([vessel, { id: 'other' }], '', 1)).toEqual([vessel]);
});
