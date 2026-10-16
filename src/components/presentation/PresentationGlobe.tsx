'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import DynamicProviderLayers from '@/components/DynamicProviderLayers';
import type { ProviderMapLayer } from '@/lib/providers/types';
import { presentationBasemap } from '@/lib/presentation/basemap';
import styles from './presentation.module.css';

export default function PresentationGlobe({ layers, onSelect, locate }: { layers: ProviderMapLayer[]; onSelect: (entity: Record<string, unknown>) => void; locate: {lat:number;lng:number;sequence:number} | null }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState<maplibregl.Map | null>(null);
  const [styleEpoch, setStyleEpoch] = useState(0);
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    let loaded = false;
    try {
      map = new maplibregl.Map({ container: container.current, style: presentationBasemap, center: [42, 24], zoom: container.current.clientWidth < 680 ? 1.1 : 1.8, minZoom: .5, maxZoom: 7, attributionControl: false });
      instance.current = map;
      map.on('load', () => { map.setProjection({ type: 'globe' }); map.once('idle', () => { loaded = true; setReady(map); }); });
      map.on('error', event => { if (event.error?.name !== 'AbortError') { console.warn('Presentation map source unavailable:', event.error?.message); setFailure(true); } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    } catch (error) { console.warn('Presentation map initialization unavailable:', error instanceof Error ? error.message : 'Renderer unavailable'); queueMicrotask(() => setFailure(true)); return; }
    let idleAt = Date.now(), lastTick = performance.now(), frame = 0;
    const pause = () => { idleAt = Date.now() + 60000; };
    const target = container.current;
    for (const event of ['pointerdown','pointermove','wheel','keydown']) target.addEventListener(event, pause, { passive: true });
    const animate = (time: number) => {
      const elapsed = Math.min(time - lastTick, 200);
      if (time - lastTick < 100) { frame = requestAnimationFrame(animate); return; }
      lastTick = time;
      if (loaded && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && Date.now() > idleAt && !map.isMoving() && map.getZoom() < 3) {
        const center = map.getCenter();
        map.jumpTo({ center: [center.lng + elapsed * .0006, center.lat] });
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      for (const event of ['pointerdown','pointermove','wheel','keydown']) target.removeEventListener(event, pause);
      instance.current = null; map.remove();
    };
  }, []);
  useEffect(() => {
    if (locate && instance.current) instance.current.flyTo({ center: [locate.lng,locate.lat], zoom: 4, duration: 1000 });
  }, [locate]);
  useEffect(() => {
    if (!ready || ready.isStyleLoaded()) return;
    // Projection changes and camera moves can temporarily defer the existing
    // provider-layer component. Retry its current descriptors after style idle.
    const retry = () => { if (ready.isStyleLoaded()) setStyleEpoch(value => value+1); };
    ready.once('idle', retry);
    return () => { ready.off('idle', retry); };
  }, [ready, layers]);
  const paintLayers = useMemo(() => layers.map(layer => ({...layer,id:`${layer.id}-${styleEpoch}`})), [layers, styleEpoch]);
  return <><div ref={container} className={styles.globe} aria-label="Live intelligence globe" data-testid="presentation-globe" data-ready={Boolean(ready)} />
    {!ready && !failure && <div className={styles.globePoster} data-testid="globe-starter"><span>Starting interactive map...</span></div>}
    <a className={styles.attribution} href="https://www.naturalearthdata.com/about/" target="_blank" rel="noopener noreferrer">Made with Natural Earth</a>
    <DynamicProviderLayers map={ready} layers={paintLayers} onEntityClick={onSelect} />
    {failure && <p className={styles.mapNotice} role="status">Map detail is unavailable. Public feed panels remain available. Check WebGL and reload.</p>}
  </>;
}
