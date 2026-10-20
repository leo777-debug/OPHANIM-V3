import type maplibregl from 'maplibre-gl';
import type { GeoJSONSourceSpecification } from 'maplibre-gl';
import type { ProviderMapLayer } from '@/lib/providers/types';

const sourceId = (layer: ProviderMapLayer) => `provider-source-${layer.id}`;
const layerId = (layer: ProviderMapLayer, suffix = 'main') => `provider-layer-${layer.id}-${suffix}`;
function safely(operation: () => void) { try { operation(); } catch { /* Map/style can disappear during cleanup. */ } }

/** Bind after style readiness and rebind after style replacement, with bounded failures. */
export function bindProviderLayers(map: maplibregl.Map, layers: ProviderMapLayer[], onEntityClick?: (entity: Record<string, unknown>) => void) {
  const visible = layers.filter(layer => layer.visible);
  let disposed = false, rendering = false, failures = 0;
  const clicks: Array<{ id: string; handler: (event: maplibregl.MapLayerMouseEvent) => void }> = [];
  const removeClicks = () => { for (const { id, handler } of clicks.splice(0)) safely(() => { map.off('click', id, handler); }); };
  const removeLayers = () => {
    for (const layer of layers) {
      for (const suffix of ['outline', 'main']) safely(() => { const id = layerId(layer, suffix); if (map.getLayer(id)) map.removeLayer(id); });
      safely(() => { const id = sourceId(layer); if (map.getSource(id)) map.removeSource(id); });
    }
  };
  const sync = () => {
    if (disposed || rendering || failures >= 3) return;
    try {
      if (!map.isStyleLoaded() || visible.every(layer => map.getSource(sourceId(layer)) && map.getLayer(layerId(layer)) && (layer.geometry !== 'polygon' || map.getLayer(layerId(layer, 'outline'))))) return;
    } catch { return; }
    rendering = true;
    try {
      removeClicks(); removeLayers();
      for (const layer of visible) {
        const source = sourceId(layer), main = layerId(layer), paint = layer.style;
        map.addSource(source, { type: 'geojson', data: layer.source as unknown as GeoJSONSourceSpecification['data'] });
        if (layer.geometry === 'point') {
          map.addLayer({ id: main, type: 'circle', source, paint: { 'circle-radius': paint.radius ?? 5, 'circle-color': paint.color, 'circle-opacity': paint.opacity ?? 0.8, 'circle-stroke-width': paint.outlineColor ? 1 : 0, 'circle-stroke-color': paint.outlineColor ?? paint.color } });
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
    disposed = true;
    safely(() => { map.off('load', sync); map.off('styledata', sync); map.off('idle', sync); map.off('style.load', styleLoaded); });
    removeClicks(); removeLayers();
  };
}
