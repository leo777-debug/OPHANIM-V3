import type { NormalizedSearchResult, Provider } from '../types';

export const ipIntelligenceProvider: Provider = {
  metadata: {
    name: 'ip-intelligence', description: 'IP geolocation and network ownership lookup.',
    supportedEntityTypes: ['ip'], supportedIntents: ['ip_lookup'], supportsMapLayers: false,
    requiresCredentials: false, timeoutMs: 5000, enabled: true, priority: 10,
  },
  async execute(query, context) {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(query.query ?? '')}/json/`, {
      signal: context.signal, headers: { Accept: 'application/json', 'User-Agent': 'OPHANIM-Intelligence-Atlas/1.0' },
    });
    if (!response.ok) throw new Error(`IP intelligence returned ${response.status}`);
    return response.json();
  },
  normalize(raw) {
    const data = raw as Record<string, unknown>;
    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    return [{
      id: `ip:${String(data.ip ?? '')}`, label: String(data.ip ?? 'IP address'), type: 'ip', category: 'network',
      importance: 1, zoomLevel: 8, provider: 'ip-intelligence',
      summary: [data.org, data.city, data.country_name].filter(Boolean).join(' | ') || 'IP intelligence record',
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
    } satisfies NormalizedSearchResult];
  },
};
