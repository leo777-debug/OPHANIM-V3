import { describe, expect, it } from 'vitest';
import { geoJsonArray } from './geojson-properties';

describe('old and current GeoJSON nested property formats', () => {
  it('reads native arrays and legacy cache strings without losing observations', () => {
    const array = ['host.example', 443];
    expect(geoJsonArray(array)).toBe(array);
    expect(geoJsonArray(JSON.stringify(array))).toEqual(array);
  });
  it('contains malformed, scalar, object and oversized payloads', () => {
    for (const value of [null, undefined, 1, {}, 'null', '{}', '{bad', 'x'.repeat(100_001)]) expect(geoJsonArray(value)).toEqual([]);
  });
});
