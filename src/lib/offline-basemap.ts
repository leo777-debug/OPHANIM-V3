import type { StyleSpecification } from 'maplibre-gl';

export const OFFLINE_BASEMAP_SOURCE = {
  name: 'Natural Earth 1:110m countries',
  licence: 'Public domain', commercialUse: 'yes', credentialsNeeded: false,
  attribution: 'Made with Natural Earth',
  termsUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  sourceUrl: 'https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson',
  fetchedAt: '2026-10-14', rateLimits: 'Bundled static snapshot; no runtime upstream requests',
} as const;

export function offlineBasemap(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
    sources: { 'offline-countries': { type: 'geojson', data: '/data/natural-earth-countries.geojson', attribution: OFFLINE_BASEMAP_SOURCE.attribution } },
    layers: [
      { id: 'offline-ocean', type: 'background', paint: { 'background-color': '#1C2B35' } },
      { id: 'offline-land', type: 'fill', source: 'offline-countries', paint: { 'fill-color': '#33433E' } },
      { id: 'offline-borders', type: 'line', source: 'offline-countries', paint: { 'line-color': '#7D9693', 'line-width': 0.8 } },
    ],
  };
}
