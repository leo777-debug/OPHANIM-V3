import { hibpProvider } from './hibp-provider';
import { mockDarkWebProvider } from './mock-provider';
import { DarkWebProviderRegistry, searchDarkWeb } from './provider-framework';
import type { DarkWebEntityType,DarkWebProviderContext } from './types';
import { licensedFeedProvider } from './licensed-providers';

const registry = new DarkWebProviderRegistry([mockDarkWebProvider, hibpProvider,licensedFeedProvider()]);
export function getDarkWebProviderCatalog() { return registry.catalog(); }
export async function runDarkWebSearch(query: string, entityTypes: DarkWebEntityType[], context: DarkWebProviderContext) { return searchDarkWeb(registry, { query: query.trim().slice(0, 500), entityTypes, limit: 50 }, context); }
