import { CATALOGUE_POLICY, PORTS, searchPorts, windyConfigured } from '@/lib/watchtower/cameras';
import type { NormalizedSearchResult, Provider, ProviderQuery } from '../types';

/** Watchtower `camera` provider: public port cameras, resolved by port or area name. */
export const cameraProvider: Provider = {
  metadata: {
    id: 'watchtower-cameras', name: 'Watchtower public port cameras', category: 'camera',
    description: 'Publicly published webcams that show Gulf and Hormuz ports, their approaches and waterfronts. Best-effort; never an all-clear.',
    supportedEntityTypes: ['port', 'location'], supportedIntents: ['port_lookup', 'forward_geocode'], capabilities: { search: true, map: true, stream: true },
    supportsMapLayers: true, requiresCredentials: false, requiredEnvironmentVariables: [], timeoutMs: 8000, rateLimitPerMinute: 30, enabled: true, priority: 40,
    geographicCoverage: 'Iran, UAE, Oman, Qatar, Bahrain, Kuwait, Saudi Arabia priority ports', freshness: 'Per-feed health check every 15 minutes',
    license: CATALOGUE_POLICY.policy, commercialUse: 'review_required',
  },
  supports: (query: ProviderQuery) => query.intent === 'port_lookup' || (query.intent === 'forward_geocode' && Boolean(query.query && searchPorts(query.query).length)),
  async search(query: ProviderQuery) { return searchPorts(query.query ?? '').slice(0, query.limit); },
  normalize(raw: unknown): NormalizedSearchResult[] {
    return (raw as typeof PORTS).map(port => ({ id: `watchtower:${port.code}`, label: `${port.name} cameras`, lat: port.lat, lng: port.lon, type: 'port_cameras', category: 'camera', importance: 0.6, zoomLevel: 11, provider: 'watchtower-cameras',
      summary: `Public cameras near ${port.name}${windyConfigured() ? '' : ' (curated catalogue only)'}`, action: { type: 'open_entity', href: `/watchtower?port=${port.code}` }, location: { country: port.country } }));
  },
  async createMapLayers() {
    return [{ id: 'watchtower-ports', provider: 'watchtower-cameras', name: 'Port cameras (Watchtower)', geometry: 'point', visible: false, interactive: true, style: { color: '#2fd5ca', radius: 6 },
      source: { type: 'FeatureCollection', features: PORTS.map(port => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [port.lon, port.lat] }, properties: { name: port.name, code: port.code, href: `/watchtower?port=${port.code}` } })) } }];
  },
};
