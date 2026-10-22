import { safeMetadata } from './scope';
import type { DarkWebProvider, DarkWebSearchQuery,DarkWebProviderContext } from './types';

export class DarkWebProviderRegistry {
  constructor(private readonly providers: DarkWebProvider[]) {}
  catalog() { return this.providers.map((provider) => ({ ...provider.metadata, configuration: provider.validateConfiguration() })).sort((a, b) => a.id.localeCompare(b.id)); }
  select(query: DarkWebSearchQuery) { return this.providers.filter((provider) => provider.metadata.enabled && provider.validateConfiguration().valid && provider.supports(query)).sort((a, b) => a.metadata.id.localeCompare(b.metadata.id)); }
}

export async function searchDarkWeb(registry: DarkWebProviderRegistry, query: DarkWebSearchQuery, context: DarkWebProviderContext) {
  const providers = registry.select(query);
  const settled = await Promise.all(providers.map(async (provider) => {
    try { return { provider, mentions: await provider.search(query, context), error: undefined as string | undefined }; }
    catch { return { provider, mentions: [], error: 'Provider unavailable; check tenant configuration and source status.' }; }
  }));
  return { mentions: settled.flatMap(({ provider, mentions }) => mentions.filter(safeMetadata).map((mention) => ({ providerId: provider.metadata.id, mention: provider.normalize(provider.redact(mention)) }))), diagnostics: settled.map(({ provider, mentions, error }) => ({ providerId: provider.metadata.id, resultCount: mentions.length, error })) };
}
