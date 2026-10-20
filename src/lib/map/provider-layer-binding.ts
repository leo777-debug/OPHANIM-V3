import type maplibregl from 'maplibre-gl';
import type { GeoJSONSourceSpecification } from 'maplibre-gl';
import type { ProviderMapLayer } from '@/lib/providers/types';

const sourceId = (layer: ProviderMapLayer) => `provider-source-${layer.id}`;
const layerId = (layer: ProviderMapLayer, suffix = 'main') => `provider-layer-${layer.id}-${suffix}`;
export const PROVIDER_CLUSTERING = { minimumPoints: 100, radiusPixels: 48, maximumZoom: 14 } as const;
const clustered = (layer: ProviderMapLayer) => layer.geometry === 'point' && layer.source.features.length >= PROVIDER_CLUSTERING.minimumPoints && layer.source.features.every(feature => feature?.geometry?.type === 'Point');
function safely(operation: () => void) { try { operation(); } catch { /* Map/style can disappear during cleanup. */ } }

/** Bind after style readiness and rebind after style replacement, with bounded failures. */
export function bindProviderLayers(map: maplibregl.Map, layers: ProviderMapLayer[], onEntityClick?: (entity: Record<string, unknown>) => void) {
  const visible = layers.filter(layer => layer.visible);
  const clusterIds = new Set(visible.filter(clustered).map(layer => layer.id));
  let disposed = false, rendering = false, failures = 0, generation = 0;
  const clicks: Array<{ id: string; handler: (event: maplibregl.MapLayerMouseEvent) => void }> = [];
  const removeClicks = () => { for (const { id, handler } of clicks.splice(0)) safely(() => { map.off('click', id, handler); }); };
  const removeLayers = () => {
    for (const layer of layers) {
      for (const suffix of ['cluster-label', 'cluster', 'outline', 'main']) safely(() => { const id = layerId(layer, suffix); if (map.getLayer(id)) map.removeLayer(id); });
      safely(() => { const id = sourceId(layer); if (map.getSource(id)) map.removeSource(id); });
    }
  };
  const sync = () => {
    if (disposed || rendering || failures >= 3) return;
    try {
      if (!map.isStyleLoaded() || visible.every(layer => map.getSource(sourceId(layer)) && map.getLayer(layerId(layer)) && (layer.geometry !== 'polygon' || map.getLayer(layerId(layer, 'outline'))) && (!clusterIds.has(layer.id) || map.getLayer(layerId(layer, 'cluster')) && map.getLayer(layerId(layer, 'cluster-label'))))) return;
    } catch { return; }
    rendering = true;
    const bindingGeneration = ++generation;
    try {
      removeClicks(); removeLayers();
      for (const layer of visible) {
        const source = sourceId(layer), main = layerId(layer), paint = layer.style;
        const useClusters = clusterIds.has(layer.id);
        map.addSource(source, { type: 'geojson', data: layer.source as unknown as GeoJSONSourceSpecification['data'], ...(useClusters ? { cluster: true, clusterRadius: PROVIDER_CLUSTERING.radiusPixels, clusterMaxZoom: PROVIDER_CLUSTERING.maximumZoom } : {}) });
        if (layer.geometry === 'point') {
          map.addLayer({ id: main, type: 'circle', source, ...(useClusters ? { filter: ['!', ['has', 'point_count']] } : {}), paint: { 'circle-radius': paint.radius ?? 5, 'circle-color': paint.color, 'circle-opacity': paint.opacity ?? 0.8, 'circle-stroke-width': paint.outlineColor ? 1 : 0, 'circle-stroke-color': paint.outlineColor ?? paint.color } });
          if (useClusters) {
            const clusterId = layerId(layer, 'cluster');
            map.addLayer({ id: clusterId, type: 'circle', source, filter: ['has', 'point_count'], paint: { 'circle-color': paint.color, 'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 14, 100, 22, 1000, 30], 'circle-opacity': paint.opacity ?? 0.85, 'circle-stroke-color': '#0b131b', 'circle-stroke-width': 2 } });
            map.addLayer({ id: layerId(layer, 'cluster-label'), type: 'symbol', source, filter: ['has', 'point_count'], layout: { 'text-field': ['to-string', ['get', 'point_count_abbreviated']], 'text-font': ['Open Sans Bold'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#081011' } });
            const handler = (event: maplibregl.MapLayerMouseEvent) => {
              const feature = event.features?.[0], id = feature?.properties?.cluster_id;
              if (feature?.geometry.type !== 'Point' || typeof id !== 'number' || !Number.isFinite(id)) return;
              const coordinates = feature.geometry.coordinates.slice(0, 2) as [number, number], geojson = map.getSource(source) as maplibregl.GeoJSONSource | undefined;
              if (!geojson) return;
              void geojson.getClusterExpansionZoom(id).then(zoom => { if (!disposed && bindingGeneration === generation && map.getSource(source) === geojson && Number.isFinite(zoom)) map.easeTo({ center: coordinates, zoom, duration: 350 }); }).catch(() => { /* Source may be replaced while a worker resolves the cluster. */ });
            };
            map.on('click', clusterId, handler); clicks.push({ id: clusterId, handler });
          }
        } else if (layer.geometry === 'line') {
          map.addLayer({ id: main, type: 'line', source, paint: { 'line-color': paint.color, 'line-width': paint.width ?? 2, 'line-opacity': paint.opacity ?? 0.8 } });
        } else {
          map.addLayer({ id: main, type: 'fill', source, paint: { 'fill-color': paint.color, 'fill-opacity': paint.opacity ?? 0.3 } });
          map.addLayer({ id: layerId(layer, 'outline'), type: 'line', source, paint: { 'line-color': paint.outlineColor ?? paint.color, 'line-width': paint.width ?? 1, 'line-opacity': paint.opacity ?? 0.8 } });
        }
        if (layer.interactive && onEntityClick) {
          const handler = (event: maplibregl.MapLayerMouseEvent) => { const feature = event.features?.[0]; if (feature) onEntityClick({ ...feature.properties, geometry: feature.geometry, provider: layer.provider }); };
          map.on('click', main, handler); clicks.push({ id: main, handler });
        }
      }
      failures = 0;
    } catch { failures++; removeClicks(); removeLayers(); }
    finally { rendering = false; }
  };
  const styleLoaded = () => { failures = 0; sync(); };
  map.on('load', sync); map.on('styledata', sync); map.on('idle', sync); map.on('style.load', styleLoaded);
  sync();
  return () => {
    disposed = true; generation++;
    safely(() => { map.off('load', sync); map.off('styledata', sync); map.off('idle', sync); map.off('style.load', styleLoaded); });
    removeClicks(); removeLayers();
  };
}
