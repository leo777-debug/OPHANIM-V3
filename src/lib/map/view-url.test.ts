import { describe, expect, it } from 'vitest';
import { legacyAtlasDestination } from '@/lib/unified-map';
import { decodeMapView, encodeMapView, hasMapView, hasPrivateViewLayers, publicMapViewUrl, restorePublicViewLayers, type MapViewSettings } from './view-url';
const view: MapViewSettings = { viewport: { latitude: 25, longitude: 55, zoom: 4 }, activeLayers: { flights: false, earthquakes: true, cables: true }, projection: 'mercator', mapStyle: 'dark' };
describe('public map settings links', () => {
  it('round trips position, projection, basemap and exact public layer selection at the unified map route', () => {
    const url = new URL(publicMapViewUrl('https://app.example', view)), restored = decodeMapView(url.searchParams);
    expect(url.pathname).toBe('/logistics/map'); expect(url.searchParams.get('view')).toBe('full'); expect(restored).toEqual({ viewport: view.viewport, projection: 'mercator', mapStyle: 'dark', layers: ['cables', 'earthquakes'] });
    expect(hasMapView(url.searchParams)).toBe(true); expect(url.searchParams.has('token')).toBe(false);
  });
  it('keeps the Presentation view choice separate from the map settings version', () => {
    const url = new URL(publicMapViewUrl('https://app.example', view, 'map'));
    expect(url.pathname).toBe('/presentation');
    expect(url.searchParams.get('view')).toBe('map');
    expect(url.searchParams.get('mapVersion')).toBe('1');
    expect(decodeMapView(url.searchParams).viewport).toEqual(view.viewport);
    const legacy = new URL('https://app.example' + legacyAtlasDestination(Object.fromEntries(url.searchParams)));
    expect(decodeMapView(legacy.searchParams)).toEqual(decodeMapView(url.searchParams));
  });
  it('does not turn absent coordinates into zero, and preserves a real zero/legacy lon', () => {
    expect(decodeMapView(new URLSearchParams()).viewport).toBeNull(); expect(hasMapView(new URLSearchParams())).toBe(false);
    expect(decodeMapView(new URLSearchParams('lat=0&lon=0&zoom=0')).viewport).toEqual({ latitude: 0, longitude: 0, zoom: 0 });
    for (const text of ['lat=91&lng=0&zoom=1', 'lat=0&lng=181&zoom=1', 'lat=&lng=0&zoom=1', 'lat=0&lng=0&zoom=99', 'lat=NaN&lng=0&zoom=1']) expect(decodeMapView(new URLSearchParams(text)).viewport).toBeNull();
  });
  it('supports all layers off, ignores unknown/private flags and fails closed when sharing private layers', () => {
    expect(decodeMapView(encodeMapView({ ...view, activeLayers: {} })).layers).toEqual([]);
    expect(restorePublicViewLayers({ flights: true, sdk_sea: true }, [])).toMatchObject({ flights: false, cables: false, conflict_zones: false, sdk_sea: false });
    expect(decodeMapView(new URLSearchParams('layers=cables,sdk_sea,private,unknown,cables')).layers).toEqual(['cables']);
    for (const id of ['sdk_sea', 'sdk_air', 'sdk_naval', 'private', 'jets', 'unreviewed-custom-layer']) {
      const activeLayers = { [id]: true }; expect(hasPrivateViewLayers(activeLayers)).toBe(true); expect(() => encodeMapView({ ...view, activeLayers })).toThrow('authenticated snapshot');
    }
  });
});
