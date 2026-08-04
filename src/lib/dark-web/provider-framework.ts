import type { DarkWebProvider, DarkWebSearchQuery } from './types';

export class DarkWebProviderRegistry {
  constructor(private readonly providers: DarkWebProvider[]) {}
  catalog() { return this.providers.map((provider) => ({ ...provider.metadata, configuration: provider.validateConfiguration() })).sort((a, b) => a.id.localeCompare(b.id)); }
  select(query: DarkWebSearchQuery) { return this.providers.filter((provider) => provider.metadata.enabled && provider.validateConfiguration().valid && provider.supports(query)).sort((a, b) => a.metadata.id.localeCompare(b.metadata.id)); }
}

export async function searchDarkWeb(registry: DarkWebProviderRegistry, query: DarkWebSearchQuery, context: { signal: AbortSignal; organizationId: string }) {
  const providers = registry.select(query);
  const settled = await Promise.all(providers.map(async (provider) => {
    try { return { provider, mentions: await provider.search(query, context), error: undefined as string | undefined }; }
    catch (error) { return { provider, mentions: [], error: error instanceof Error ? error.message : 'Provider failed.' }; }
  }));
  return { mentions: settled.flatMap(({ provider, mentions }) => mentions.map((mention) => ({ providerId: provider.metadata.id, mention: provider.normalize(provider.redact(mention)) }))), diagnostics: settled.map(({ provider, mentions, error }) => ({ providerId: provider.metadata.id, resultCount: mentions.length, error })) };
}
