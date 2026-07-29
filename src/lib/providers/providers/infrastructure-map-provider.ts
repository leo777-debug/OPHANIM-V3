import type { Provider, ProviderMapLayer } from '../types';

export const infrastructureMapProvider: Provider = {
  metadata: {
    name: 'infrastructure-map', description: 'Critical infrastructure map layers.', supportedEntityTypes: [], supportedIntents: [],
    supportsMapLayers: true, requiresCredentials: false, timeoutMs: 10000, enabled: true, priority: 40,
  },
  async execute() { return []; },
  normalize() { return []; },
  async createMapLayers(context) {
    if (!context.origin) return [];
    const response = await fetch(`${context.origin}/api/infrastructure`, { signal: context.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Infrastructure source returned ${response.status}`);
    const data = await response.json();
    const features = (data.infrastructure || []).filter((facility: any) => Number.isFinite(facility.lat) && Number.isFinite(facility.lng)).map((facility: any) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [facility.lng, facility.lat] },
      properties: { ...facility, entityType: 'infrastructure' },
    }));
    const layer: ProviderMapLayer = {
      id: 'critical-infrastructure', provider: 'infrastructure-map', name: 'Critical infrastructure', geometry: 'point',
      source: { type: 'FeatureCollection', features },
      style: { color: '#26a69a', opacity: 0.8, radius: 6, outlineColor: '#07151b' }, visible: true, interactive: true,
    };
    return [layer];
  },
};
