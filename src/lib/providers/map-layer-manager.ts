import { normalizeMapLayers } from './map-layer-normalizer';
import { providerId, type Provider, type ProviderMapLayer, type ProviderMapLayerContext } from './types';
import { providerHealth } from './provider-health';
import { providerMetrics } from './provider-metrics';

export class MapLayerManager {
  async collect(providers: Provider[], context: ProviderMapLayerContext): Promise<ProviderMapLayer[]> {
    const responses = await Promise.allSettled(providers.map((provider) => this.withTimeout(provider, context)));
    return normalizeMapLayers(responses.flatMap((response) => response.status === 'fulfilled' ? response.value : []));
  }

  private async withTimeout(provider: Provider, context: ProviderMapLayerContext): Promise<ProviderMapLayer[]> {
    if (!provider.createMapLayers) return [];
    const id = providerId(provider.metadata);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.metadata.timeoutMs);
    let rejectionTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const startedAt = performance.now();
      const layers = await Promise.race([
        provider.createMapLayers({ ...context, signal: controller.signal }),
        new Promise<never>((_, reject) => {
          rejectionTimeout = setTimeout(() => reject(new Error('Provider map-layer timeout')), provider.metadata.timeoutMs);
        }),
      ]);
      providerHealth.recordSuccess(id);
      providerMetrics.recordSuccess(id, performance.now() - startedAt);
      return layers;
    } catch (error) {
      providerHealth.recordFailure(id);
      providerMetrics.recordFailure(id, error instanceof Error && /timeout/i.test(error.message));
      throw error;
    } finally {
      clearTimeout(timeout);
      if (rejectionTimeout) clearTimeout(rejectionTimeout);
    }
  }
}
