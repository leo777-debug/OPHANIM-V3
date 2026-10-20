import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MARITIME_NETWORK } from '@/lib/route-intelligence/reference';
import { referencePortFeatures } from './reference-ports';
describe('dated port reference map', () => {
  it('retains packaged points with pinned provenance and no live status claim', () => {
    const file = readFileSync('public/reference/ports.geojson'), source = referencePortFeatures(JSON.parse(file.toString('utf8')));
    expect(createHash('sha256').update(file).digest('hex')).toBe(MARITIME_NETWORK.portsSha256);
    expect(source.features).toHaveLength(3962); expect(source.features.every(feature => feature.properties?.dataMode === 'reference')).toBe(true);
    expect(source.features[0].geometry.coordinates).toEqual([19.448813, 41.318731]);
  });
  it('rejects unbounded collections and discards invalid coordinates and extra fields', () => {
    expect(() => referencePortFeatures({ features: Array(10001).fill({}) })).toThrow();
    const result = referencePortFeatures({ features: [null, { geometry: { type: 'Point', coordinates: [Infinity, 0] } }, { geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Fixture', arbitrary: 'not retained' } }] });
    expect(result.features).toHaveLength(1); expect(result.features[0].properties).not.toHaveProperty('arbitrary');
  });
});
