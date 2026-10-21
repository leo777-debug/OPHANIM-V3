'use client';
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { OPEN_FREE_MAP } from '@/lib/map/basemap-sources';

export type LensPoint = { id: string; lon: number; lat: number; label: string; color: string; layer: string };
export type LensLine = { id: string; coordinates: Array<[number, number]>; color: string; width?: number; dashed?: boolean; opacity?: number };
export type LensPolygon = { id: string; coordinates: Array<[number, number]>; color: string; opacity?: number };
const FALLBACK: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1117' } }] };

/** Small map for Watchtower and Route Lens: points (clickable), lines (route, alternatives) and polygons (corridor). */
export default function LensMap({ points, lines = [], polygons = [], onPick, height = 420 }: { points: LensPoint[]; lines?: LensLine[]; polygons?: LensPolygon[]; onPick?: (id: string) => void; height?: number }) {
  const element = useRef<HTMLDivElement>(null), map = useRef<MapLibreMap | null>(null), pick = useRef(onPick);
  useEffect(() => { pick.current = onPick; }, [onPick]);
  useEffect(() => {
    if (!element.current) return;
    const instance = new maplibregl.Map({ container: element.current, style: OPEN_FREE_MAP.styleUrl, center: [54.5, 25.5], zoom: 4, attributionControl: { compact: true } });
    // Keyless basemap first; plain background if it cannot load.
    const fallback = window.setTimeout(() => { if (!instance.isStyleLoaded()) instance.setStyle(FALLBACK); }, 4000);
    instance.on('load', () => window.clearTimeout(fallback));
    instance.on('click', 'lens-points', (event: MapLayerMouseEvent) => { const id = event.features?.[0]?.properties?.id; if (typeof id === 'string') pick.current?.(id); });
    instance.on('mouseenter', 'lens-points', () => { instance.getCanvas().style.cursor = 'pointer'; });
    instance.on('mouseleave', 'lens-points', () => { instance.getCanvas().style.cursor = ''; });
    map.current = instance;
    return () => { window.clearTimeout(fallback); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const draw = () => {
      const data = {
        polygons: { type: 'FeatureCollection' as const, features: polygons.map(item => ({ type: 'Feature' as const, properties: { color: item.color, opacity: item.opacity ?? 0.12 }, geometry: { type: 'Polygon' as const, coordinates: [item.coordinates] } })) },
        lines: { type: 'FeatureCollection' as const, features: lines.map(item => ({ type: 'Feature' as const, properties: { color: item.color, width: item.width ?? 2, dashed: item.dashed ? 1 : 0, opacity: item.opacity ?? 0.95 }, geometry: { type: 'LineString' as const, coordinates: item.coordinates } })) },
        points: { type: 'FeatureCollection' as const, features: points.map(item => ({ type: 'Feature' as const, properties: { id: item.id, label: item.label, color: item.color }, geometry: { type: 'Point' as const, coordinates: [item.lon, item.lat] } })) },
      };
      for (const [name, value] of Object.entries(data)) {
        const source = instance.getSource(`lens-${name}`) as GeoJSONSource | undefined;
        if (source) source.setData(value); else instance.addSource(`lens-${name}`, { type: 'geojson', data: value });
      }
      if (!instance.getLayer('lens-polygons')) instance.addLayer({ id: 'lens-polygons', type: 'fill', source: 'lens-polygons', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] } });
      if (!instance.getLayer('lens-lines')) instance.addLayer({ id: 'lens-lines', type: 'line', source: 'lens-lines', paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'] } });
      if (!instance.getLayer('lens-points')) instance.addLayer({ id: 'lens-points', type: 'circle', source: 'lens-points', paint: { 'circle-color': ['get', 'color'], 'circle-radius': 6, 'circle-stroke-color': '#0b1117', 'circle-stroke-width': 2 } });
      const all = [...points.map(item => [item.lon, item.lat] as [number, number]), ...lines.flatMap(item => item.coordinates)];
      if (all.length) {
        const bounds = all.reduce((box, [lon, lat]) => box.extend([lon, lat]), new maplibregl.LngLatBounds(all[0], all[0]));
        instance.fitBounds(bounds, { padding: 40, maxZoom: 11, duration: 0 });
      }
    };
    if (instance.isStyleLoaded()) draw(); else instance.once('idle', draw);
  }, [points, lines, polygons]);
  return <div ref={element} style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #2a3744' }} role="region" aria-label="Map" />;
}
