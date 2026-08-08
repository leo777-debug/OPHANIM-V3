import { providerCapabilities, providerId, type Provider, type ProviderQuery } from './types';
import { providerHealth } from './provider-health';
import { providerMetrics } from './provider-metrics';
import { sourceGovernance } from './source-governance';

export class ProviderRegistry {
  constructor(private readonly providers: Provider[]) {}

  getCatalog() {
    return this.providers
      .map((provider) => ({
        ...provider.metadata,
        id: providerId(provider.metadata),
        capabilities: providerCapabilities(provider.metadata),
        configured: !provider.metadata.requiresCredentials || Boolean(provider.isConfigured?.()),
        configuration: provider.validateConfiguration?.() ?? { valid: true },
        health: providerHealth.get(providerId(provider.metadata)),
        metrics: providerMetrics.get(providerId(provider.metadata)),
        governance: sourceGovernance(providerId(provider.metadata)),
      }))
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

  findProviders(query: ProviderQuery): Provider[] {
    return this.enabledProviders().filter((provider) => {
      const { metadata } = provider;
      const capabilities = providerCapabilities(metadata);
      return capabilities.search
        && metadata.supportedEntityTypes.includes(query.entityType)
        && metadata.supportedIntents.includes(query.intent)
        && (provider.supports?.(query) ?? true);
    });
  }

  findMapLayerProviders(requestedProviders?: string[]): Provider[] {
    const requested = requestedProviders && requestedProviders.length > 0 ? new Set(requestedProviders) : null;
    return this.enabledProviders().filter((provider) =>
      providerCapabilities(provider.metadata).map && Boolean(provider.createMapLayers)
        && (!requested || requested.has(providerId(provider.metadata)))
    );
  }

  private enabledProviders(): Provider[] {
    return this.providers.filter((provider) => {
      const { metadata } = provider;
      const configuration = provider.validateConfiguration?.();
      return metadata.enabled
        && configuration?.valid !== false
        && (!metadata.requiresCredentials || !!provider.isConfigured?.());
    }).sort((a, b) => a.metadata.priority - b.metadata.priority || a.metadata.name.localeCompare(b.metadata.name));
  }
}
