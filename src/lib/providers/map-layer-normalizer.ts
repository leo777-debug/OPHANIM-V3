import type { ProviderMapFeature, ProviderMapLayer } from './types';

const validGeometryTypes = new Set(['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);

function validFeature(feature: ProviderMapFeature, geometry: ProviderMapLayer['geometry']): boolean {
  if (feature.type !== 'Feature' || !validGeometryTypes.has(feature.geometry?.type)) return false;
  if (!feature.geometry.coordinates) return false;
  if (geometry === 'point') return feature.geometry.type === 'Point';
  if (geometry === 'line') return feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';
  return feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';
}

export function normalizeMapLayers(layers: ProviderMapLayer[]): ProviderMapLayer[] {
  const seen = new Set<string>();
  return layers.filter((layer) => {
    if (!/^[a-z0-9-]+$/i.test(layer.id) || seen.has(layer.id)) return false;
    if (!/^#[0-9a-f]{6}$/i.test(layer.style.color)) return false;
    seen.add(layer.id);
    layer.source.features = layer.source.features.filter((feature) => validFeature(feature, layer.geometry));
    return true;
  });
}
