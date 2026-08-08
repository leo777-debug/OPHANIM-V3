import type { NormalizedSearchResult, Provider } from '../types';

interface DomainRaw { domain: string; addresses: string[]; registrar?: string; created?: string; }

export const domainIntelligenceProvider: Provider = {
  metadata: {
    id: 'domain-intelligence', name: 'domain-intelligence', description: 'DNS and RDAP domain intelligence lookup.', category: 'network',
    supportedEntityTypes: ['domain'], supportedIntents: ['domain_lookup'], supportsMapLayers: false,
    requiresCredentials: false, timeoutMs: 8000, enabled: true, priority: 10,
  },
  async createMapLayers() { return []; },
  async execute(query, context): Promise<DomainRaw> {
    const domain = query.query ?? '';
    const [dnsResult, rdapResult] = await Promise.allSettled([
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, { signal: context.signal }).then((response) => response.json()),
      fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { signal: context.signal, headers: { Accept: 'application/json' } }).then((response) => response.ok ? response.json() : null),
    ]);
    const dns = dnsResult.status === 'fulfilled' ? dnsResult.value as { Answer?: Array<{ data?: string }> } : {};
    const rdap = rdapResult.status === 'fulfilled' ? rdapResult.value as { events?: Array<{ eventAction?: string; eventDate?: string }>; entities?: unknown[] } | null : null;
    return {
      domain,
      addresses: (dns.Answer ?? []).map((record) => record.data).filter((value): value is string => Boolean(value)),
      registrar: Array.isArray(rdap?.entities) ? 'RDAP record available' : undefined,
      created: rdap?.events?.find((event) => event.eventAction === 'registration')?.eventDate,
    };
  },
  normalize(raw) {
    const data = raw as DomainRaw;
    return [{
      id: `domain:${data.domain}`, label: data.domain, type: 'domain', category: 'network', importance: 1,
      zoomLevel: 0, provider: 'domain-intelligence',
      summary: [data.addresses.length ? `A: ${data.addresses.join(', ')}` : 'No A records', data.created ? `Registered: ${data.created}` : data.registrar].filter(Boolean).join(' | '),
    }];
  },
};
