'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import OphanimMap from '@/components/OphanimMap';
import { atlasFallbackBasemap } from '@/lib/presentation/basemap';
import { atlasPresentationData, pickPublicMapPoint } from '@/lib/presentation/map-adapter';
import type { FeedId, PresentationFeed } from '@/lib/presentation/types';
import type { MapProjection, MapStyle } from '@/lib/map-workspaces';
import styles from './presentation.module.css';

export default function PresentationGlobe({ feeds, hidden, onSelect, locate, projection, mapStyle }: {
  feeds: Partial<Record<FeedId, PresentationFeed>>; hidden: ReadonlySet<FeedId>;
  onSelect: (entity: Record<string, unknown>) => void;
  locate: {lat:number;lng:number;sequence:number} | null;
  projection: MapProjection; mapStyle: MapStyle;
}) {
  const [basemap, setBasemap] = useState<maplibregl.StyleSpecification | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    // Keep the original dark cartography without CARTO's API-key watermark.
    void fetch('https://tiles.openfreemap.org/styles/dark', { signal: AbortSignal.any([controller.signal,AbortSignal.timeout(1800)]) })
      .then(async response => { if (!response.ok) throw new Error('Style unavailable'); const style = await response.json(); if (style.version !== 8 || !Array.isArray(style.layers)) throw new Error('Invalid style'); if (!controller.signal.aborted) setBasemap(style); })
      .catch(() => { if (!controller.signal.aborted) { setBasemap(atlasFallbackBasemap); setFallback(true); } });
    return () => controller.abort();
  }, []);
  const onReady = useCallback((instance: maplibregl.Map) => {
    setMap(instance);
    instance.once('idle', () => setReady(true));
    instance.addControl(new maplibregl.NavigationControl(), 'bottom-right');
  }, []);
  useEffect(() => {
    if (!map) return;
    const select = (event: maplibregl.MapMouseEvent) => {
      try {
        // MapLibre's symbol query can throw on an empty symbol dictionary.
        // Pick the nearest visible original observation without decoding tiles.
        const entity = pickPublicMapPoint(feeds,hidden,event.point,
          (lng,lat) => map.project([lng+360*Math.round((map.getCenter().lng-lng)/360),lat]),
          (lng,lat) => map.transform.isLocationOccluded(new maplibregl.LngLat(lng,lat)));
        if (entity) onSelect(entity);
      } catch { /* A tile replaced during a click is not an application failure. */ }
    };
    map.on('click',select);
    return () => { map.off('click',select); };
  }, [map,feeds,hidden,onSelect]);
  const publicPresentation = useMemo(() => basemap ? { style: basemap, onReady } : undefined, [basemap,onReady]);
  const atlas = useMemo(() => atlasPresentationData(feeds,hidden), [feeds,hidden]);
  const flyTo = useMemo(() => locate ? { ...locate, ts:locate.sequence, zoom:4 } : null, [locate]);
  const initialView = useMemo(() => ({longitude:42,latitude:24,zoom:window.innerWidth<680?1.1:1.8}), []);
  useEffect(() => {
    if (!map) return;
    let idleAt = Date.now();
    const pause = () => { idleAt = Date.now()+60000; };
    const target = map.getCanvas();
    for (const event of ['pointerdown','pointermove','wheel','keydown']) target.addEventListener(event,pause,{passive:true});
    const timer = setInterval(() => {
      if (projection === 'globe' && Date.now()>idleAt && !document.hidden && !map.isMoving() && map.getZoom()<3 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const center = map.getCenter(); map.jumpTo({center:[center.lng+.06,center.lat]});
      }
    },100);
    return () => { clearInterval(timer); for (const event of ['pointerdown','pointermove','wheel','keydown']) target.removeEventListener(event,pause); };
  }, [map,projection]);
  return <>
    <div className={styles.globe} aria-label="Live intelligence globe" data-testid="presentation-globe" data-ready={ready} data-renderer="ophanim-atlas" data-map-style={mapStyle} data-projection={projection}>
      {publicPresentation && <OphanimMap data={atlas.data} activeLayers={atlas.activeLayers} initialView={initialView} projection={projection} mapStyle={mapStyle} flyToLocation={flyTo} publicPresentation={publicPresentation} />}
    </div>
    {!ready && <div className={styles.globePoster} data-testid="globe-starter"><span>Starting Ophanim map...</span></div>}
    <div className={styles.attribution}>
      {fallback ? <a href="https://www.naturalearthdata.com/about/" target="_blank" rel="noopener noreferrer">Natural Earth (offline basemap)</a> : <><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> / <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></>}
      {mapStyle !== 'dark' && <> / <a href="https://www.esri.com/en-us/legal/terms/data-attributions" target="_blank" rel="noopener noreferrer">Esri and data contributors</a></>}
    </div>
  </>;
}
