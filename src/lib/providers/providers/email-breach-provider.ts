import type { Provider } from '../types';

export const emailBreachProvider: Provider = {
  metadata: {
    name: 'email-breach', description: 'Public breach exposure lookup for an email address.',
    supportedEntityTypes: ['email'], supportedIntents: ['email_lookup'], supportsMapLayers: false,
    requiresCredentials: false, timeoutMs: 8000, enabled: true, priority: 10,
  },
  async execute(query, context) {
    const email = query.query ?? '';
    const response = await fetch(`https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(email)}`, {
      signal: context.signal, headers: { Accept: 'application/json', 'User-Agent': 'OPHANIM-Intelligence-Atlas/1.0' },
    });
    if (response.status === 404) return { email, breaches: [] };
    if (!response.ok) throw new Error(`Email breach lookup returned ${response.status}`);
    return { email, data: await response.json() };
  },
  normalize(raw) {
    const value = raw as { email: string; breaches?: string[]; data?: { BreachesSummary?: { site?: string } } };
    const breaches = value.breaches ?? value.data?.BreachesSummary?.site?.split(';').filter(Boolean) ?? [];
    return [{
      id: `email:${value.email}`, label: value.email, type: 'email', category: 'identity', importance: 1,
      zoomLevel: 0, provider: 'email-breach', summary: breaches.length ? `Exposure found in: ${breaches.join(', ')}` : 'No public breach exposure reported',
    }];
  },
};
