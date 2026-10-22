import { createHash } from 'node:crypto';
import { collectIntelligenceEvents } from './event-provider-registry';
import { SPECIALIST_SOURCES } from './specialist-providers';
import { PublicUpdateHub } from './public-update-hub';

export const publicSourceUpdates = new PublicUpdateHub(async () => {
  const result = await collectIntelligenceEvents({ providerIds: SPECIALIST_SOURCES.filter(source => source.format !== 'govuk' && source.commercialUse === 'yes').map(source => source.id), limitPerProvider: 100 });
  const revision = createHash('sha256').update(JSON.stringify({
    events: result.events.map(event => [event.externalId, event.title, event.summary, event.startedAt, event.severity, event.attributes.dataMode]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    status: result.diagnostics.map(item => [item.providerId, item.status]).sort(),
  })).digest('hex');
  return { revision, checkedAt: new Date().toISOString(), updateMode: 'polling', intervalSeconds: 300, failedSources: result.diagnostics.filter(item => item.status !== 'success').length };
});
