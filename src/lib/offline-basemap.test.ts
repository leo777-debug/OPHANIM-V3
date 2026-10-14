import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offlineBasemap, OFFLINE_BASEMAP_SOURCE } from './offline-basemap';
describe('local basemap fallback', () => {
  it('bundles real country geometry with a reviewed public-domain attribution', () => {
    const data = JSON.parse(readFileSync('public/data/natural-earth-countries.geojson', 'utf8'));
    expect(data.type).toBe('FeatureCollection');
    expect(data.features.length).toBeGreaterThan(170);
    expect(data.features.some((feature: { properties: { ADMIN: string } }) => feature.properties.ADMIN === 'United Arab Emirates')).toBe(true);
    expect(OFFLINE_BASEMAP_SOURCE.commercialUse).toBe('yes');
    expect(OFFLINE_BASEMAP_SOURCE.credentialsNeeded).toBe(false);
  });
  it('does not depend on remote tiles for coastline, land or borders', () => {
    const style = offlineBasemap();
    expect(style.sources['offline-countries']).toMatchObject({ type: 'geojson', data: '/data/natural-earth-countries.geojson' });
    expect(style.layers.map((layer) => layer.id)).toEqual(['offline-ocean', 'offline-land', 'offline-borders']);
  });
});
