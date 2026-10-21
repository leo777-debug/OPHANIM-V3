import { hibpDomainProvider, licensedFeedProvider } from './licensed-providers';
import { mockDarkWebProvider } from './mock-provider';
import { DarkWebProviderRegistry, searchDarkWeb } from './provider-framework';
import type { DarkWebEntityType } from './types';

// Licensed adapters stay inactive until their keys are configured (validateConfiguration).
const registry = new DarkWebProviderRegistry([mockDarkWebProvider, hibpDomainProvider(), licensedFeedProvider()]);
export function getDarkWebProviderCatalog() { return registry.catalog(); }
export async function runDarkWebSearch(query: string, entityTypes: DarkWebEntityType[], context: { signal: AbortSignal; organizationId: string; allowedTerms?: string[] }) { return searchDarkWeb(registry, { query: query.trim().slice(0, 500), entityTypes, limit: 50 }, context); }
