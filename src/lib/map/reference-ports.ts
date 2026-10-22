import type { ProviderMapLayer } from '@/lib/providers/types';
import { MARITIME_NETWORK } from '@/lib/route-intelligence/reference';
/** Select only dated public reference point fields. No live operating status is inferred. */
export function referencePortFeatures(value: unknown): ProviderMapLayer['source'] {
  if (!value || typeof value !== 'object' || !('features' in value) || !Array.isArray(value.features) || value.features.length > 10000) throw new Error('Reference port dataset is invalid or exceeds the supported bound.');
  return { type: 'FeatureCollection', features: value.features.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const geometry = raw.geometry, coordinates = geometry?.coordinates;
    if (geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 2 || typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number' || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) return [];
    const properties = raw.properties ?? {};
    const text = (field: unknown) => typeof field === 'string' ? field.slice(0, 200) : '';
    return [{ type: 'Feature', geometry: { type: 'Point', coordinates: [coordinates[0], coordinates[1]] }, properties: { name: text(properties.name), port: text(properties.port), country: text(properties.cty), dataMode: 'reference', datasetDate: MARITIME_NETWORK.datasetDate } }];
  }) };
}
