import type { OrganizationActor } from '@/lib/operations/types';
import { searchProviders } from '@/lib/providers';
import { requirePlatformCapability } from './capabilities';
import { listEntities } from './entities';
import { listEvents } from './events';
import { listCases } from './workflows';

export async function searchPlatform(actor: OrganizationActor, query: string, locale = 'en') {
  const term = query.trim();
  if (!term) throw new Error('Search query is required.');
  const configuration = await requirePlatformCapability(actor, 'search');
  const [entities, events, cases, providerResponse] = await Promise.all([
    listEntities(actor, term, 12),
    listEvents(actor, term, 12),
    listCases(actor).then((items) => items.filter((item) => `${item.title} ${item.description ?? ''}`.toLowerCase().includes(term.toLowerCase())).slice(0, 12)),
    searchProviders({ query: term, limit: '12' }, { locale, allowedProviderIds: configuration.enabledProviderIds }),
  ]);
  return {
    entities: entities.map((entity) => ({ id: entity.id, label: entity.canonicalName, type: entity.entityType, href: `/entities/record/${entity.id}` })),
    events: events.map((event) => ({ id: event.id, label: event.title, type: event.eventType, href: `/events/${event.id}` })),
    cases: cases.map((item) => ({ id: item.id, label: item.title, type: 'case', href: `/cases/${item.id}` })),
    providers: providerResponse.results,
    diagnostics: providerResponse.diagnostics,
  };
}
