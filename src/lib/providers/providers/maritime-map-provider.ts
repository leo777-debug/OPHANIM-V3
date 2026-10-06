import type { Provider, ProviderMapLayer } from '../types';

const emptyResults: never[] = [];

function pointLayer(id: string, name: string, color: string, items: any[], properties: (item: any) => Record<string, unknown>): ProviderMapLayer {
  return {
    id, provider: 'maritime-map', name, geometry: 'point',
    source: {
      type: 'FeatureCollection',
      features: items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)).map((item) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [item.lng, item.lat] }, properties: properties(item),
      })),
    },
    style: { color, opacity: 0.82, radius: id === 'maritime-vessels' ? 4 : 6, outlineColor: '#07151b' },
    visible: true, interactive: true,
  };
}

export const maritimeMapProvider: Provider = {
  metadata: {
    id: 'maritime-map', name: 'maritime-map', description: 'Live vessel and port map layers.', category: 'maritime', supportedEntityTypes: [], supportedIntents: [],
    supportsMapLayers: true, requiresCredentials: false, timeoutMs: 15000, enabled: true, priority: 30,
  },
  async execute() { return emptyResults; },
  normalize() { return emptyResults; },
  async createMapLayers(context) {
    if (!context.origin) return [];
    const response = await fetch(`${context.origin}/api/maritime`, { signal: context.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Maritime source returned ${response.status}`);
    const data = await response.json();
    return [
      pointLayer('maritime-ports', 'Ports', '#26c6da', data.ports || [], (port) => ({ ...port, entityType: 'port' })),
      pointLayer('maritime-vessels', 'Live vessels', '#69f0ae', data.ships || [], (ship) => ({ ...ship, entityType: 'vessel' })),
    ];
  },
};
