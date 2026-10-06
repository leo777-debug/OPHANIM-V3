import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Provider, ProviderMapLayer } from '../types';

export const submarineCablesProvider: Provider = {
  metadata: {
    id: 'submarine-cables', name: 'submarine-cables', description: 'Submarine cable network map layer.', category: 'infrastructure', supportedEntityTypes: [], supportedIntents: [],
    supportsMapLayers: true, requiresCredentials: false, timeoutMs: 3000, enabled: true, priority: 50,
  },
  async execute() { return []; },
  normalize() { return []; },
  async createMapLayers() {
    const file = path.join(process.cwd(), 'public', 'data', 'submarine-cables.json');
    const data = JSON.parse(await readFile(file, 'utf8'));
    const layer: ProviderMapLayer = {
      id: 'submarine-cables', provider: 'submarine-cables', name: 'Submarine cables', geometry: 'line',
      source: { type: 'FeatureCollection', features: Array.isArray(data.features) ? data.features : [] },
      style: { color: '#1976d2', opacity: 0.55, width: 1.5 }, visible: true, interactive: true,
    };
    return [layer];
  },
};
