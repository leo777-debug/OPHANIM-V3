import type { Provider, ProviderQuery } from './types';

export class ProviderRegistry {
  constructor(private readonly providers: Provider[]) {}

  getCatalog() {
    return this.providers
      .map((provider) => ({
        ...provider.metadata,
        configured: !provider.metadata.requiresCredentials || Boolean(provider.isConfigured?.()),
      }))
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

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
