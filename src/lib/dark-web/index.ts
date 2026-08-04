import { mockDarkWebProvider } from './mock-provider';
import { DarkWebProviderRegistry, searchDarkWeb } from './provider-framework';
import type { DarkWebEntityType } from './types';

const registry = new DarkWebProviderRegistry([mockDarkWebProvider]);
export function getDarkWebProviderCatalog() { return registry.catalog(); }
export async function runDarkWebSearch(query: string, entityTypes: DarkWebEntityType[], context: { signal: AbortSignal; organizationId: string }) { return searchDarkWeb(registry, { query: query.trim().slice(0, 500), entityTypes, limit: 50 }, context); }
