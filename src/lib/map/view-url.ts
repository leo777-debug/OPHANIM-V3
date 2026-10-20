import type { MapProjection, MapStyle, MapViewport } from '@/lib/map-workspaces';

/** Only public display flags may be encoded. Private records/identifiers are never serialized. */
export const PUBLIC_VIEW_LAYERS = new Set('flights military maritime ship_cargo ship_tanker ship_passenger ship_fishing ship_military satellites sat_comms sat_military sat_navigation sat_earth sat_science balloons cctv camera_logistics camera_transport live_news news_intel earthquakes fires weather radiation infrastructure global_incidents war_alerts gps_jamming day_night cables war_sanctions terrain_3d malware conflict_zones'.split(' '));
export interface MapViewSettings { viewport: MapViewport; activeLayers: Record<string, boolean>; projection: MapProjection; mapStyle: MapStyle }
const number = (value: string | null, minimum: number, maximum: number) => {
  if (value === null || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const result = Number(value); return Number.isFinite(result) && result >= minimum && result <= maximum ? result : null;
};
export function decodeMapView(params: URLSearchParams): { viewport: MapViewport | null; projection: MapProjection | null; mapStyle: MapStyle | null; layers: string[] | null } {
  const latitude = number(params.get('lat'), -90, 90), longitude = number(params.get('lng') ?? params.get('lon'), -180, 180), zoom = number(params.get('zoom'), 0, 22);
  const viewport = latitude !== null && longitude !== null && zoom !== null ? { latitude, longitude, zoom } : null;
  const projection = params.get('projection'), style = params.get('style'), rawLayers = params.get('layers');
  return { viewport, projection: projection === 'globe' || projection === 'mercator' ? projection : null, mapStyle: style === 'dark' || style === 'earth' || style === 'satellite' ? style : null,
    layers: rawLayers !== null && rawLayers.length <= 2048 ? [...new Set(rawLayers.split(',').filter(layer => PUBLIC_VIEW_LAYERS.has(layer)))] : null };
}
export function hasMapView(params: URLSearchParams) { const view = decodeMapView(params); return Boolean(view.viewport || view.projection || view.mapStyle || view.layers !== null); }
export function hasPrivateViewLayers(activeLayers: Record<string, boolean>) { return Object.entries(activeLayers).some(([id, active]) => active === true && !PUBLIC_VIEW_LAYERS.has(id)); }
export function restorePublicViewLayers(previous: Record<string, boolean>, selected: string[]): Record<string, boolean> {
  const active = new Set(selected.filter(id => PUBLIC_VIEW_LAYERS.has(id)));
  return Object.fromEntries([...new Set([...Object.keys(previous), ...PUBLIC_VIEW_LAYERS])].map(id => [id, active.has(id)]));
}
export function encodeMapView(view: MapViewSettings): URLSearchParams {
  const params = new URLSearchParams();
  if (hasPrivateViewLayers(view.activeLayers)) throw new Error('Private layers require an authenticated snapshot; public settings sharing is unavailable.');
  const { latitude, longitude, zoom } = view.viewport;
  if (![latitude, longitude, zoom].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || zoom < 0 || zoom > 22) throw new Error('Map view is not ready to share.');
  params.set('view', 'map-v1'); params.set('lat', latitude.toFixed(5)); params.set('lng', longitude.toFixed(5)); params.set('zoom', zoom.toFixed(2));
  params.set('projection', view.projection); params.set('style', view.mapStyle);
  params.set('layers', Object.entries(view.activeLayers).filter(([id, active]) => active === true && PUBLIC_VIEW_LAYERS.has(id)).map(([id]) => id).sort().join(','));
  return params;
}
export function publicMapViewUrl(origin: string, view: MapViewSettings) {
  const url = new URL('/atlas', origin); url.search = encodeMapView(view).toString(); return url.toString();
}
