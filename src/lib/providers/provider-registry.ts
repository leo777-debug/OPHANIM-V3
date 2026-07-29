import type { Provider, ProviderQuery } from './types';

export class ProviderRegistry {
  constructor(private readonly providers: Provider[]) {}

  findProviders(query: ProviderQuery): Provider[] {
    return this.providers.filter((provider) => {
      const { metadata } = provider;
      if (!metadata.enabled) return false;
      if (metadata.requiresCredentials && (!provider.isConfigured || !provider.isConfigured())) return false;
      return metadata.supportedEntityTypes.includes(query.entityType)
        && metadata.supportedIntents.includes(query.intent);
    }).sort((a, b) => a.metadata.priority - b.metadata.priority || a.metadata.name.localeCompare(b.metadata.name));
  }
}
