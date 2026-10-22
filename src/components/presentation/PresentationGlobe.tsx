'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import OphanimMap from '@/components/OphanimMap';
import { atlasFallbackBasemap } from '@/lib/presentation/basemap';
import { OPEN_FREE_MAP } from '@/lib/map/basemap-sources';
import { atlasPresentationData, pickPublicMapPoint } from '@/lib/presentation/map-adapter';
import type { ProviderMapLayer } from '@/lib/providers/types';
import type { FeedId, PresentationFeed } from '@/lib/presentation/types';
import type { MapProjection, MapStyle, MapViewport } from '@/lib/map-workspaces';
import styles from './presentation.module.css';

export default function PresentationGlobe({ feeds, hidden, onSelect, locate, projection, mapStyle, dayNight, embedded = false, initialViewport, onViewportChange, extraLayers, providerLayers }: {
  feeds: Partial<Record<FeedId, PresentationFeed>>; hidden: ReadonlySet<FeedId>;
  onSelect: (entity: Record<string, unknown>) => void;
  locate: {lat:number;lng:number;sequence:number;zoom?:number} | null;
  projection: MapProjection; mapStyle: MapStyle;
  dayNight: boolean;
  embedded?: boolean;
  initialViewport?: MapViewport;
  onViewportChange?: (view:MapViewport)=>void;
  extraLayers?: Record<string,boolean>;
  providerLayers?:ProviderMapLayer[];
}) {
  const [basemap, setBasemap] = useState<maplibregl.StyleSpecification | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const rotating=useRef(false);
  const onNativeViewport=useCallback((viewport:MapViewport)=>{
    if(!rotating.current)onViewportChange?.(viewport);
  },[onViewportChange]);
  useEffect(() => {
    const controller = new AbortController();
    // Keep the original dark cartography without CARTO's API-key watermark.
    void fetch(OPEN_FREE_MAP.styleUrl, { signal: AbortSignal.any([controller.signal,AbortSignal.timeout(1800)]) })
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
          (lng,lat) => {
            // A back-side globe point projects onto the front hemisphere. Public
            // unproject must return the original location before it is selectable.
            const visible = map.unproject(map.project([lng,lat]));
            return new maplibregl.LngLat(lng,lat).distanceTo(visible) > 10;
          });
        if (entity) onSelect(entity);
      } catch { /* A tile replaced during a click is not an application failure. */ }
    };
    map.on('click',select);
    return () => { map.off('click',select); };
  }, [map,feeds,hidden,onSelect]);
  const publicPresentation = useMemo(() => basemap ? { style: basemap, onReady } : undefined, [basemap,onReady]);
  const atlas = useMemo(() => atlasPresentationData(feeds,hidden), [feeds,hidden]);
  const activeLayers = useMemo(()=>({...atlas.activeLayers,...extraLayers,day_night:dayNight}),[atlas.activeLayers,extraLayers,dayNight]);
  const flyTo = useMemo(() => locate ? { ...locate, ts:locate.sequence, zoom:locate.zoom??4 } : null, [locate]);
  const [initialView] = useState(() => initialViewport ?? {longitude:42,latitude:24,zoom:window.innerWidth<680?1.1:1.8});
  useEffect(() => {
    if (!map) return;
    let idleAt = Date.now();
    const pause = () => { idleAt = Date.now()+60000; };
    const target = map.getCanvas();
    for (const event of ['pointerdown','pointermove','wheel','keydown']) target.addEventListener(event,pause,{passive:true});
    const timer = setInterval(() => {
      if (projection === 'globe' && Date.now()>idleAt && !document.hidden && !map.isMoving() && map.getZoom()<3 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const center = map.getCenter();
        rotating.current=true;
        try { map.jumpTo({center:[center.lng+.06,center.lat]}); }
        finally { rotating.current=false; }
      }
    },100);
    return () => { clearInterval(timer); for (const event of ['pointerdown','pointermove','wheel','keydown']) target.removeEventListener(event,pause); };
  }, [map,projection]);
  return <>
    <div className={styles.globe} style={embedded?{position:'absolute',inset:0,width:'100%',height:'100%'}:undefined} aria-label="Operational intelligence globe" data-testid="presentation-globe" data-ready={ready} data-renderer="ophanim-atlas" data-map-style={mapStyle} data-projection={projection}>
      {publicPresentation && <OphanimMap providerLayers={providerLayers} onEntityClick={onSelect} data={atlas.data} activeLayers={activeLayers} initialView={initialView} projection={projection} mapStyle={mapStyle} flyToLocation={flyTo} publicPresentation={publicPresentation} onViewStateChange={onNativeViewport} />}
    </div>
    {!ready && <div className={styles.globePoster} style={embedded?{inset:0}:undefined} data-testid="globe-starter"><span>Starting Ophanim map...</span></div>}
    <div className={styles.attribution} style={embedded?{left:8,bottom:4}:undefined}>
      {fallback ? <a href="https://www.naturalearthdata.com/about/" target="_blank" rel="noopener noreferrer">Natural Earth (offline basemap)</a> : <><a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> / <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></>}
      {mapStyle !== 'dark' && <> / <a href="https://www.esri.com/en-us/legal/terms/data-attributions" target="_blank" rel="noopener noreferrer">Esri and data contributors</a></>}
    </div>
  </>;
}
