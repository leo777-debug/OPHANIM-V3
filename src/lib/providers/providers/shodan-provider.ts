import { shodanClient } from '@/lib/shodan/client';
import { normalizeService, ShodanError, type ShodanHost, type ShodanSearch } from '@/lib/shodan/types';
import type { Provider, NormalizedSearchResult } from '../types';

export const shodanProvider: Provider = {
  metadata: { id: 'shodan', name: 'Shodan', description: 'Authenticated Shodan database searches and IP service lookups. Active scans are separate, owner-authorized operations.',
    category: 'network', supportedEntityTypes: ['ip', 'command'], supportedIntents: ['ip_lookup', 'shodan_search'],
    supportsMapLayers: false, requiresCredentials: true, requiredEnvironmentVariables: ['SHODAN_API_KEY'],
    timeoutMs: 55000, rateLimitPerMinute: 60, enabled: true, priority: 15,
    freshness: 'Shodan observation timestamps; not necessarily live or same-day.', license: 'Shodan API terms', commercialUse: 'review_required' },
  isConfigured: () => Boolean(process.env.SHODAN_API_KEY?.trim()),
  async execute(query, context) {
    if (!context.organizationId) throw new ShodanError('access_denied', 'Sign in to use Shodan.', 403);
    const client = shodanClient();
    return query.intent === 'ip_lookup' ? client.host(query.query ?? '', false, false, context.signal) : client.search(query.query ?? '', '', 1, context.signal);
  },
  normalize(raw, query) {
    const host = raw as ShodanHost;
    const records = query.intent === 'ip_lookup' ? [host.services[0] ?? normalizeService({ ip_str: host.ip, org: host.org, timestamp: host.last_update })] : (raw as ShodanSearch).matches;
    return records.slice(0, query.limit).map((service): NormalizedSearchResult => ({
      id: `shodan:${service.ip_str}:${service.port}:${service.transport}`, label: `${service.ip_str}${service.port !== null ? `:${service.port}` : ''}`,
      provider: 'shodan', type: 'ip', category: 'network', importance: 0.9, zoomLevel: 8,
      summary: [service.org, service.product, service.timestamp ? `Observed ${service.timestamp} UTC` : 'Observation time unknown'].filter(Boolean).join(' | '),
      action: { type: 'open_entity', href: `/entities/ip/${encodeURIComponent(service.ip_str)}` },
      ...(service.location.latitude !== null && service.location.longitude !== null ? { lat: service.location.latitude, lng: service.location.longitude } : {}),
    }));
  },
};
