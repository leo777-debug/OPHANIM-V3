'use client';

import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { GeoJSONSourceSpecification } from 'maplibre-gl';
import type { ProviderMapLayer } from '@/lib/providers';

interface DynamicProviderLayersProps {
  map: maplibregl.Map | null;
  layers: ProviderMapLayer[];
  onEntityClick?: (entity: Record<string, unknown>) => void;
}

function sourceId(layer: ProviderMapLayer) {
  return `provider-source-${layer.id}`;
}

function layerId(layer: ProviderMapLayer, suffix = 'main') {
  return `provider-layer-${layer.id}-${suffix}`;
}

function isStyleReady(map: maplibregl.Map) {
  try {
    return map.isStyleLoaded();
  } catch {
    return false;
  }
}

function safelyRunMapOperation(operation: () => void) {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
}

export default function DynamicProviderLayers({ map, layers, onEntityClick }: DynamicProviderLayersProps) {
  const renderedRef = useRef<ProviderMapLayer[]>([]);

  useEffect(() => {
    if (!map) return;
    let drawing=false;
    let removeRendered=()=>{};

    const remove = (layer: ProviderMapLayer) => {
      const source = sourceId(layer);
      for (const suffix of ['outline', 'main']) {
        const id = layerId(layer, suffix);
        const layerRemoved = safelyRunMapOperation(() => {
          if (map.getLayer(id)) map.removeLayer(id);
        });
        if (!layerRemoved) return;
      }
      safelyRunMapOperation(() => {
        if (map.getSource(source)) map.removeSource(source);
      });
    };

    const sync=()=>{
    if(drawing||!isStyleReady(map)||layers.filter(l=>l.visible).every(l=>map.getSource(sourceId(l))&&map.getLayer(layerId(l))))return;
    drawing=true;
    removeRendered();
    renderedRef.current.forEach(remove);
    const listeners: Array<{ id: string; handler: (event: maplibregl.MapLayerMouseEvent) => void }> = [];

    for (const descriptor of layers.filter((layer) => layer.visible)) {
      const source = sourceId(descriptor);
      const main = layerId(descriptor);
      map.addSource(source, { type: 'geojson', data: descriptor.source as unknown as GeoJSONSourceSpecification['data'] });

      const paint = descriptor.style;
      if (descriptor.geometry === 'point') {
        map.addLayer({ id: main, type: 'circle', source, paint: {
          'circle-radius': paint.radius ?? 5,
          'circle-color': paint.color,
          'circle-opacity': paint.opacity ?? 0.8,
          'circle-stroke-width': paint.outlineColor ? 1 : 0,
          'circle-stroke-color': paint.outlineColor ?? paint.color,
        } });
      } else if (descriptor.geometry === 'line') {
        map.addLayer({ id: main, type: 'line', source, paint: {
          'line-color': paint.color,
          'line-width': paint.width ?? 2,
          'line-opacity': paint.opacity ?? 0.8,
        } });
      } else {
        map.addLayer({ id: main, type: 'fill', source, paint: {
          'fill-color': paint.color,
          'fill-opacity': paint.opacity ?? 0.3,
        } });
        map.addLayer({ id: layerId(descriptor, 'outline'), type: 'line', source, paint: {
          'line-color': paint.outlineColor ?? paint.color,
          'line-width': paint.width ?? 1,
          'line-opacity': paint.opacity ?? 0.8,
        } });
      }

      if (descriptor.interactive && onEntityClick) {
        const handler = (event: maplibregl.MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature) return;
          onEntityClick({ ...feature.properties, geometry: feature.geometry, provider: descriptor.provider });
        };
        map.on('click', main, handler);
        listeners.push({ id: main, handler });
      }
    }

    renderedRef.current = layers;
    removeRendered=() => {
      listeners.forEach(({ id, handler }) => {
        safelyRunMapOperation(() => map.off('click', id, handler));
      });
      renderedRef.current.forEach(remove);
      renderedRef.current = [];
    };
    drawing=false;
    };
    // Initial provider data can arrive before style readiness; style changes also
    // remove custom sources. Re-attach only missing layers, without a render loop.
    sync();map.on('styledata',sync);map.on('idle',sync);
    return()=>{drawing=true;map.off('styledata',sync);map.off('idle',sync);removeRendered();};
  }, [map, layers, onEntityClick]);

  return null;
}
