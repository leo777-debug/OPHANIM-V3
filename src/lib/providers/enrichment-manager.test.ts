import { describe, expect, it } from 'vitest';
import { EnrichmentManager } from './enrichment-manager';
import type { Provider, ProviderQuery } from './types';

const query: ProviderQuery = { intent: 'forward_geocode', entityType: 'location', query: 'Paris', limit: 8 };

function provider(name: string, execute: Provider['execute']): Provider {
  return {
    metadata: {
      name, description: 'test', supportedEntityTypes: ['location'], supportedIntents: ['forward_geocode'],
      supportsMapLayers: false, requiresCredentials: false, timeoutMs: 20, enabled: true,
    },
    execute,
    normalize() {
      return [{ id: name, label: name, lat: 48.8566, lng: 2.3522, type: 'city', category: 'place', importance: 1, zoomLevel: 12, provider: name }];
    },
  };
}

describe('EnrichmentManager', () => {
  it('keeps successful provider results when another provider fails', async () => {
    const manager = new EnrichmentManager();
    const response = await manager.enrich(query, [
      provider('working', async () => []),
      provider('failing', async () => { throw new Error('unavailable'); }),
    ]);

    expect(response.results).toHaveLength(1);
    expect(response.diagnostics).toEqual([
      { provider: 'working', status: 'success', resultCount: 1 },
      { provider: 'failing', status: 'error', resultCount: 0 },
    ]);
  });

  it('reports a provider timeout without failing the search', async () => {
    const manager = new EnrichmentManager();
    const response = await manager.enrich(query, [provider('slow', async () => new Promise(() => undefined))]);
    expect(response.results).toEqual([]);
    expect(response.diagnostics).toEqual([{ provider: 'slow', status: 'timeout', resultCount: 0 }]);
  });
});
