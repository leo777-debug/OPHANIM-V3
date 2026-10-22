import type { Map, StyleSpecification } from 'maplibre-gl';

/** Fallback only during initial startup; never reset a working map's data layers. */
export function bindBasemapFallback(map: Map, style: StyleSpecification, onFallback: () => void, milliseconds = 4000) {
  let disposed = false, applied = false;
  const fallback = () => {
    if (disposed || applied) return;
    applied = true;
    clearTimeout(timer);
    try { map.setStyle(style); onFallback(); } catch { /* Renderer shutdown can race a failed request. */ }
  };
  const loaded = () => dispose();
  const timer = setTimeout(fallback, milliseconds);
  const dispose = () => {
    disposed = true; clearTimeout(timer);
    map.off('error', fallback); map.off('load', loaded);
  };
  map.on('error', fallback); map.once('load', loaded);
  return dispose;
}
