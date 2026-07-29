import type { Provider, ProviderQuery } from './types';

export class ProviderRegistry {
  constructor(private readonly providers: Provider[]) {}

  findProviders(query: ProviderQuery): Provider[] {
    return this.enabledProviders().filter((provider) => {
      const { metadata } = provider;
      return metadata.supportedEntityTypes.includes(query.entityType)
        && metadata.supportedIntents.includes(query.intent);
    });
  }

  findMapLayerProviders(requestedProviders?: string[]): Provider[] {
    const requested = requestedProviders && requestedProviders.length > 0 ? new Set(requestedProviders) : null;
    return this.enabledProviders().filter((provider) =>
      provider.metadata.supportsMapLayers && (!requested || requested.has(provider.metadata.name))
    );
  }

  private enabledProviders(): Provider[] {
    return this.providers.filter((provider) => {
      const { metadata } = provider;
      return metadata.enabled && (!metadata.requiresCredentials || !!provider.isConfigured?.());
    }).sort((a, b) => a.metadata.priority - b.metadata.priority || a.metadata.name.localeCompare(b.metadata.name));
  }
}
