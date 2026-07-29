import { describe, expect, it } from 'vitest';
import { MapLayerManager } from './map-layer-manager';
import type { Provider } from './types';

const provider: Provider = {
  metadata: {
    name: 'test-map', description: 'test', supportedEntityTypes: [], supportedIntents: [],
    supportsMapLayers: true, requiresCredentials: false, timeoutMs: 100, enabled: true, priority: 1,
  },
  async execute() { return []; },
  normalize() { return []; },
  async createMapLayers() {
    return [{
      id: 'test-point', provider: 'test-map', name: 'Test point', geometry: 'point', visible: true, interactive: true,
      source: { type: 'FeatureCollection', features: [{
        type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Point' },
      }] },
      style: { color: '#112233' },
    }, {
      id: 'test-line', provider: 'test-map', name: 'Test line', geometry: 'line', visible: true, interactive: true,
      source: { type: 'FeatureCollection', features: [{
        type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { name: 'Line' },
      }] },
      style: { color: '#112233' },
    }, {
      id: 'test-polygon', provider: 'test-map', name: 'Test polygon', geometry: 'polygon', visible: true, interactive: true,
      source: { type: 'FeatureCollection', features: [{
        type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { name: 'Test' },
      }] },
      style: { color: '#112233', opacity: 0.4, outlineColor: '#445566' },
    }];
  },
};

describe('MapLayerManager', () => {
  it('returns validated provider point, line, and polygon descriptors', async () => {
    const layers = await new MapLayerManager().collect([provider], { signal: new AbortController().signal });
    expect(layers.map((layer) => layer.geometry)).toEqual(['point', 'line', 'polygon']);
  });

  it('does not let one failed provider suppress another layer', async () => {
    const failing = { ...provider, metadata: { ...provider.metadata, name: 'broken' }, async createMapLayers() { throw new Error('offline'); } };
    const layers = await new MapLayerManager().collect([failing, provider], { signal: new AbortController().signal });
    expect(layers).toHaveLength(3);
  });
});
