import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from './provider-registry';
import type { Provider } from './types';

const locationProvider: Provider = {
  metadata: {
    name: 'location', description: 'test', supportedEntityTypes: ['location'], supportedIntents: ['forward_geocode'],
    supportsMapLayers: false, requiresCredentials: false, timeoutMs: 100, enabled: true,
  },
  async execute() { return []; },
  normalize() { return []; },
};

describe('ProviderRegistry', () => {
  it('selects only enabled providers that support the classified query', () => {
    const disabled = { ...locationProvider, metadata: { ...locationProvider.metadata, name: 'disabled', enabled: false } };
    const registry = new ProviderRegistry([locationProvider, disabled]);
    expect(registry.findProviders({ intent: 'forward_geocode', entityType: 'location', query: 'Paris', limit: 8 }))
      .toEqual([locationProvider]);
  });
});
