import { normalizeMapLayers } from './map-layer-normalizer';
import type { Provider, ProviderMapLayer, ProviderMapLayerContext } from './types';

export class MapLayerManager {
  async collect(providers: Provider[], context: ProviderMapLayerContext): Promise<ProviderMapLayer[]> {
    const responses = await Promise.allSettled(providers.map((provider) => this.withTimeout(provider, context)));
    return normalizeMapLayers(responses.flatMap((response) => response.status === 'fulfilled' ? response.value : []));
  }

  private async withTimeout(provider: Provider, context: ProviderMapLayerContext): Promise<ProviderMapLayer[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.metadata.timeoutMs);
    let rejectionTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        provider.createMapLayers({ ...context, signal: controller.signal }),
        new Promise<never>((_, reject) => {
          rejectionTimeout = setTimeout(() => reject(new Error('Provider map-layer timeout')), provider.metadata.timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      if (rejectionTimeout) clearTimeout(rejectionTimeout);
    }
  }
}
