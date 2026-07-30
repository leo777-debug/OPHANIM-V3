import { EnrichmentManager } from './enrichment-manager';
import { MapLayerManager } from './map-layer-manager';
import { domainIntelligenceProvider } from './providers/domain-intelligence-provider';
import { emailBreachProvider } from './providers/email-breach-provider';
import { githubUsernameProvider } from './providers/github-username-provider';
import { ghostTrackProvider } from './providers/ghosttrack-provider';
import { ipIntelligenceProvider } from './providers/ip-intelligence-provider';
import { mapCommandProvider } from './providers/map-command-provider';
import { maritimeProvider } from './providers/maritime-provider';
import { maigretProvider } from './providers/maigret-provider';
import { maritimeMapProvider } from './providers/maritime-map-provider';
import { nominatimProvider } from './providers/nominatim-provider';
import { sanctionsEntityProvider } from './providers/sanctions-entity-provider';
import { submarineCablesProvider } from './providers/submarine-cables-provider';
import { infrastructureMapProvider } from './providers/infrastructure-map-provider';
import { warSanctionsProvider } from './providers/war-sanctions-provider';
import { voidAccessProvider } from './providers/voidaccess-provider';
import { ProviderRegistry } from './provider-registry';
import { classifySearch, type SearchInput } from './query-classifier';
import type { ProviderExecutionContext, ProviderQuery } from './types';

export { classifySearch } from './query-classifier';
export * from './types';

const registry = new ProviderRegistry([
  ipIntelligenceProvider,
  domainIntelligenceProvider,
  emailBreachProvider,
  githubUsernameProvider,
  maigretProvider,
  ghostTrackProvider,
  voidAccessProvider,
  sanctionsEntityProvider,
  warSanctionsProvider,
  maritimeProvider,
  mapCommandProvider,
  nominatimProvider,
  maritimeMapProvider,
  infrastructureMapProvider,
  submarineCablesProvider,
]);
const enrichmentManager = new EnrichmentManager();
const mapLayerManager = new MapLayerManager();

export async function searchProviders(input: SearchInput, context: Omit<ProviderExecutionContext, 'signal'> = { locale: 'en' }) {
  const query = classifySearch(input);
  if (query.intent === 'coordinate_lookup' && query.coordinates) {
    return {
      results: [{
        id: `coordinate:${query.coordinates.lat},${query.coordinates.lng}`,
        label: `${query.coordinates.lat.toFixed(4)}, ${query.coordinates.lng.toFixed(4)}`,
        lat: query.coordinates.lat,
        lng: query.coordinates.lng,
        type: 'coordinate',
        category: 'coordinate',
        importance: 1,
        zoomLevel: 15,
        provider: 'coordinate-input',
      }],
      diagnostics: [],
    };
  }

  return enrichmentManager.enrich(query, registry.findProviders(query), context);
}

export async function getProviderMapLayers(
  context: Pick<ProviderExecutionContext, 'origin'> & { requestedProviders?: string[] },
) {
  const controller = new AbortController();
  return mapLayerManager.collect(registry.findMapLayerProviders(context.requestedProviders), {
    signal: controller.signal,
    origin: context.origin,
    requestedProviders: context.requestedProviders,
  });
}

export async function checkWatchlistProviders(
  item: { type: 'ip' | 'domain' | 'ship' | 'port' | 'company' | 'region' | 'country' | 'threat_actor'; value: string },
  context: Omit<ProviderExecutionContext, 'signal'> = { locale: 'en' },
) {
  if (item.type === 'threat_actor') return { results: [], diagnostics: [], coverage: 'unavailable' as const };
  const value = item.value.trim();
  const query: ProviderQuery = item.type === 'ship'
    ? (/^\d{7}$/.test(value) ? { intent: 'imo_lookup', entityType: 'imo', query: value, limit: 8 } : /^\d{9}$/.test(value) ? { intent: 'mmsi_lookup', entityType: 'mmsi', query: value, limit: 8 } : { intent: 'vessel_lookup', entityType: 'vessel', query: value, limit: 8 })
    : ({ ...({
      ip: { intent: 'ip_lookup', entityType: 'ip' }, domain: { intent: 'domain_lookup', entityType: 'domain' },
      port: { intent: 'port_lookup', entityType: 'port' }, company: { intent: 'company_lookup', entityType: 'company' },
      region: { intent: 'region_lookup', entityType: 'region' }, country: { intent: 'country_lookup', entityType: 'country' },
    }[item.type] as Pick<ProviderQuery, 'intent' | 'entityType'>), query: value, limit: 8 });
  const response = await enrichmentManager.enrich(query, registry.findProviders(query), context);
  return { ...response, coverage: response.diagnostics.length ? 'available' as const : 'unavailable' as const };
}
