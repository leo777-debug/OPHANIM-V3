import { EnrichmentManager } from './enrichment-manager';
import { nominatimProvider } from './providers/nominatim-provider';
import { ProviderRegistry } from './provider-registry';
import { classifySearch, type SearchInput } from './query-classifier';

export { classifySearch } from './query-classifier';
export * from './types';

const registry = new ProviderRegistry([nominatimProvider]);
const enrichmentManager = new EnrichmentManager();

export async function searchProviders(input: SearchInput) {
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

  return enrichmentManager.enrich(query, registry.findProviders(query));
}
