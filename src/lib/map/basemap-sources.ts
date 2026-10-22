import sources from './basemap-sources.json';
export const OPEN_FREE_MAP = sources.openFreeMap;
export const NATURAL_EARTH_BASEMAP = sources.naturalEarth;
// OpenFreeMap's glyph server has single Noto Sans fontstacks only; any other font or
// combined stack returns 404 and labels using it never draw.
export const LABEL_FONT = [OPEN_FREE_MAP.clusterFont];
export const LABEL_FONT_BOLD = ['Noto Sans Bold'];
