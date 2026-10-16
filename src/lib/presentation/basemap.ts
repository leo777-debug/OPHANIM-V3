import type { StyleSpecification } from 'maplibre-gl';

// Shared by the interactive globe and its generated, geography-only starter view.
export const presentationBasemap: StyleSpecification = {
  version: 8,
  sources: { countries: { type: 'geojson', data: '/presentation/countries.geojson', attribution: '<a href="https://www.naturalearthdata.com/about/" target="_blank" rel="noopener">Made with Natural Earth</a>' } },
  layers: [
    { id: 'ocean', type: 'background', paint: { 'background-color': '#122c3b' } },
    { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': '#2b4039', 'fill-opacity': 1 } },
    { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': '#61777b', 'line-width': .65, 'line-opacity': .65 } },
  ],
};

// Retain the old atlas night palette when external tiles cannot be loaded.
export const atlasFallbackBasemap: StyleSpecification = {
  ...presentationBasemap,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'ocean', type: 'background', paint: { 'background-color': '#2b343b' } },
    { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': '#0a0b0e' } },
    { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': '#677178', 'line-width': .65, 'line-opacity': .7 } },
  ],
};
