import { EnrichmentManager } from './enrichment-manager';
import { domainIntelligenceProvider } from './providers/domain-intelligence-provider';
import { emailBreachProvider } from './providers/email-breach-provider';
import { githubUsernameProvider } from './providers/github-username-provider';
import { ipIntelligenceProvider } from './providers/ip-intelligence-provider';
import { mapCommandProvider } from './providers/map-command-provider';
import { maritimeProvider } from './providers/maritime-provider';
import { nominatimProvider } from './providers/nominatim-provider';
import { sanctionsEntityProvider } from './providers/sanctions-entity-provider';
import { ProviderRegistry } from './provider-registry';
import { classifySearch, type SearchInput } from './query-classifier';
import type { ProviderExecutionContext } from './types';

export { classifySearch } from './query-classifier';
export * from './types';

const registry = new ProviderRegistry([
  ipIntelligenceProvider,
  domainIntelligenceProvider,
  emailBreachProvider,
  githubUsernameProvider,
  sanctionsEntityProvider,
  maritimeProvider,
  mapCommandProvider,
  nominatimProvider,
]);
const enrichmentManager = new EnrichmentManager();

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
