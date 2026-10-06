import { search, type Schema } from '@/lib/sanctions';
import type { Provider } from '../types';

const schemas: Record<string, Schema> = { company: 'Company', organization: 'Organization' };

export const sanctionsEntityProvider: Provider = {
  metadata: {
    id: 'sanctions-entity', name: 'sanctions-entity', description: 'OpenSanctions OFAC company and organization lookup.', category: 'sanctions',
    supportedEntityTypes: ['company', 'organization'], supportedIntents: ['company_lookup', 'organization_lookup'], supportsMapLayers: false,
    requiresCredentials: false, timeoutMs: 30000, enabled: true, priority: 10,
  },
  async createMapLayers() { return []; },
  execute(query) {
    return search(query.query ?? '', { schema: schemas[query.entityType], limit: query.limit });
  },
  normalize(raw) {
    const entries = raw as Array<{ id: string; name: string; schema: string; countries: string[]; programs: string[] }>;
    return entries.map((entry) => ({
      id: `sanctions:${entry.id}`, label: entry.name, type: entry.schema.toLowerCase(), category: 'entity', importance: 0.9,
      zoomLevel: 0, provider: 'sanctions-entity',
      summary: [entry.schema, entry.countries?.join(', '), entry.programs?.join(', ')].filter(Boolean).join(' | '),
    }));
  },
};
