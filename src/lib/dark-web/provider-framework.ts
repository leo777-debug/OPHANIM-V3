import { isProhibitedContent } from './content-filter';
import { classifyThreats } from './threat-categories';
import type { DarkWebProvider, DarkWebProviderContext, DarkWebRawMention, DarkWebSearchQuery } from './types';

export class DarkWebProviderRegistry {
  constructor(private readonly providers: DarkWebProvider[]) {}
  catalog() { return this.providers.map((provider) => ({ ...provider.metadata, configuration: provider.validateConfiguration() })).sort((a, b) => a.id.localeCompare(b.id)); }
  select(query: DarkWebSearchQuery) { return this.providers.filter((provider) => provider.metadata.enabled && provider.validateConfiguration().valid && provider.supports(query)).sort((a, b) => a.metadata.id.localeCompare(b.metadata.id)); }
}

export async function searchDarkWeb(registry: DarkWebProviderRegistry, query: DarkWebSearchQuery, context: DarkWebProviderContext) {
  const providers = registry.select(query);
  const settled = await Promise.all(providers.map(async (provider) => {
    try {
      const results = await provider.search(query, context);
      // Prohibited content is dropped before anything is normalised, hashed or stored.
      const kept = results.filter((mention) => !isProhibitedContent(mention.title, mention.originalText, mention.translatedText));
      return { provider, mentions: kept, dropped: results.length - kept.length, error: undefined as string | undefined };
    } catch (error) { return { provider, mentions: [], dropped: 0, error: error instanceof Error ? error.message : 'Provider failed.' }; }
  }));
  const tag = (mention: DarkWebRawMention): DarkWebRawMention => ({ ...mention, threatCategories: [...new Set([...mention.threatCategories, ...classifyThreats(`${mention.title ?? ''} ${mention.originalText} ${mention.translatedText ?? ''}`)])] });
  return { mentions: settled.flatMap(({ provider, mentions }) => mentions.map((mention) => ({ providerId: provider.metadata.id, mention: provider.normalize(provider.redact(tag(mention))) }))), diagnostics: settled.map(({ provider, mentions, dropped, error }) => ({ providerId: provider.metadata.id, resultCount: mentions.length, droppedProhibited: dropped, error })) };
}
