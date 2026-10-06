import { describe, expect, it } from 'vitest';
import { closeMapWorkspace, createMapWorkspace, updateMapWorkspace } from './map-workspaces';

const main = createMapWorkspace({
  id: 'main',
  label: 'Global',
  activeLayers: { flights: true, maritime: true },
  projection: 'globe',
  mapStyle: 'dark',
  viewport: { latitude: 20, longitude: 0, zoom: 2.5 },
});

describe('map workspaces', () => {
  it('clones a workspace snapshot instead of sharing mutable map settings', () => {
    const target = createMapWorkspace({
      ...main,
      id: 'target',
      label: 'tesla.com',
      target: { type: 'domain', value: 'tesla.com' },
    });

    target.activeLayers.flights = false;
    target.viewport.zoom = 8;

    expect(main.activeLayers.flights).toBe(true);
    expect(main.viewport.zoom).toBe(2.5);
  });

  it('updates only the selected workspace', () => {
    const target = createMapWorkspace({ ...main, id: 'target', label: 'Target' });
    const updated = updateMapWorkspace([main, target], 'target', {
      mapStyle: 'earth',
      viewport: { latitude: 40, longitude: 20, zoom: 6 },
    });

    expect(updated[0].mapStyle).toBe('dark');
    expect(updated[1].mapStyle).toBe('earth');
    expect(updated[1].viewport).toEqual({ latitude: 40, longitude: 20, zoom: 6 });
  });

  it('removes only the requested workspace', () => {
    const target = createMapWorkspace({ ...main, id: 'target', label: 'Target' });
    expect(closeMapWorkspace([main, target], 'target')).toEqual([main]);
  });
});
