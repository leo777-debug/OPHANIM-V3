import type { Provider } from '../types';

export const githubUsernameProvider: Provider = {
  metadata: {
    name: 'github-username', description: 'Public GitHub username profile lookup.',
    supportedEntityTypes: ['username'], supportedIntents: ['username_lookup'], supportsMapLayers: false,
    requiresCredentials: false, timeoutMs: 8000, enabled: true, priority: 10,
  },
  async createMapLayers() { return []; },
  async execute(query, context) {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(query.query ?? '')}`, {
      signal: context.signal, headers: { Accept: 'application/json', 'User-Agent': 'OPHANIM-Intelligence-Atlas/1.0' },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    return response.json();
  },
  normalize(raw) {
    const user = raw as Record<string, unknown>;
    return [{
      id: `github:${String(user.login ?? '')}`, label: `@${String(user.login ?? 'unknown')}`, type: 'username', category: 'identity', importance: 1,
      zoomLevel: 0, provider: 'github-username',
      summary: [user.name, user.company, typeof user.public_repos === 'number' ? `${user.public_repos} repositories` : undefined].filter(Boolean).join(' | ') || 'GitHub profile',
    }];
  },
};
