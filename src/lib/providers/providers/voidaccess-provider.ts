import type { NormalizedSearchResult, Provider, ProviderQuery } from '../types';

type VoidAccessStatus = 'pending' | 'processing' | 'completed' | 'completed_no_results' | 'failed' | 'cancelled';

interface VoidAccessRaw {
  status: 'unavailable' | 'queued' | 'complete' | 'error';
  query: string;
  runId?: string;
  investigation?: { status?: VoidAccessStatus; summary?: string; entity_count?: number; page_count?: number };
  entities?: Array<{ id?: string; value?: string; entity_type?: string; confidence?: number; context?: string; source_count?: number }>;
  message?: string;
}

function settings() {
  return {
    apiUrl: process.env.VOIDACCESS_API_URL?.replace(/\/$/, ''),
    token: process.env.VOIDACCESS_API_TOKEN,
    email: process.env.VOIDACCESS_API_EMAIL,
    password: process.env.VOIDACCESS_API_PASSWORD,
  };
}

function configured() {
  const { apiUrl, token, email, password } = settings();
  return Boolean(apiUrl && (token || (email && password)));
}

async function getToken(signal: AbortSignal) {
  const { apiUrl, token, email, password } = settings();
  if (token) return token;
  if (!apiUrl || !email || !password) return undefined;

  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`VoidAccess login returned ${response.status}.`);
  const body = await response.json() as { access_token?: unknown };
  return typeof body.access_token === 'string' ? body.access_token : undefined;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function request(url: string, init: RequestInit, signal: AbortSignal, token: string) {
  const response = await fetch(url, { ...init, signal, headers: { ...headers(token), ...init.headers } });
  if (!response.ok) throw new Error(`VoidAccess returned ${response.status}.`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function pause(ms: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('VoidAccess request aborted.')); }, { once: true });
  });
}

export const voidAccessProvider: Provider = {
  metadata: {
    id: 'voidaccess', name: 'voidaccess', category: 'dark_web',
    description: 'Backend-only dark-web threat-intelligence investigations through VoidAccess.',
    supportedEntityTypes: ['command'],
    supportedIntents: ['dark_web_lookup'],
    supportsMapLayers: false,
    requiresCredentials: true,
    timeoutMs: 15000,
    enabled: process.env.VOIDACCESS_ENABLED !== 'false',
    priority: 20,
  },
  isConfigured() {
    return configured();
  },
  async createMapLayers() { return []; },
  async execute(query, context): Promise<VoidAccessRaw> {
    const { apiUrl } = settings();
    const subject = query.query ?? '';
    if (!apiUrl || !configured()) return { status: 'unavailable', query: subject, message: 'Dark-web intelligence is not configured on this server.' };

    try {
      const token = await getToken(context.signal);
      if (!token) throw new Error('VoidAccess did not return a usable access token.');
      const created = await request(`${apiUrl}/investigations`, {
        method: 'POST', body: JSON.stringify({ query: subject, run_crawler: false }),
      }, context.signal, token);
      const runId = typeof created.run_id === 'string' ? created.run_id : undefined;
      if (!runId) throw new Error('VoidAccess did not return an investigation identifier.');

      // The remote pipeline is asynchronous. A brief poll returns quick hits without holding the request open.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await pause(1200, context.signal);
        const investigation = await request(`${apiUrl}/investigations/${encodeURIComponent(runId)}`, { method: 'GET' }, context.signal, token);
        const status = investigation.status as VoidAccessStatus | undefined;
        if (status === 'completed' || status === 'completed_no_results') {
          const entityResponse = await request(`${apiUrl}/investigations/${encodeURIComponent(runId)}/entities?limit=${query.limit}`, { method: 'GET' }, context.signal, token);
          return {
            status: 'complete', query: subject, runId,
            investigation: investigation as VoidAccessRaw['investigation'],
            entities: Array.isArray(entityResponse.items) ? entityResponse.items as VoidAccessRaw['entities'] : [],
          };
        }
        if (status === 'failed' || status === 'cancelled') {
          return { status: 'error', query: subject, runId, message: typeof investigation.summary === 'string' ? investigation.summary : `VoidAccess investigation ${status}.` };
        }
      }
      return { status: 'queued', query: subject, runId, message: 'Dark-web investigation queued. Results will be available after the provider completes collection.' };
    } catch (error) {
      return { status: 'error', query: subject, message: error instanceof Error ? error.message : 'VoidAccess could not complete the investigation.' };
    }
  },
  normalize(raw, query): NormalizedSearchResult[] {
    const result = raw as VoidAccessRaw;
    if (result.status === 'complete') {
      const entities = result.entities ?? [];
      const record: NormalizedSearchResult = {
        id: `voidaccess:${result.runId ?? result.query}`,
        label: `Dark-web intelligence: ${result.query}`,
        type: 'dark-web-investigation', category: 'threat-intelligence', importance: 0.9, zoomLevel: 0, provider: 'voidaccess',
        summary: result.investigation?.summary || `${result.investigation?.entity_count ?? entities.length} entities from ${result.investigation?.page_count ?? 0} collected pages.`,
      };
      return [record, ...entities.slice(0, Math.max(query.limit - 1, 0)).map((entity, index) => ({
        id: `voidaccess:${result.runId}:entity:${entity.id ?? index}`,
        label: entity.value || 'Dark-web indicator', type: entity.entity_type || 'indicator', category: 'dark-web',
        importance: entity.confidence ?? 0.7, zoomLevel: 0, provider: 'voidaccess',
        summary: [entity.context, entity.source_count ? `${entity.source_count} sources` : undefined].filter(Boolean).join(' | ') || 'Extracted by VoidAccess.',
      }))];
    }
    return [{
      id: `voidaccess:${result.status}:${result.runId ?? result.query}`,
      label: result.status === 'queued' ? 'Dark-web investigation queued' : result.status === 'unavailable' ? 'Dark-web intelligence unavailable' : 'Dark-web investigation failed',
      type: 'dark-web-investigation', category: 'threat-intelligence', importance: 0, zoomLevel: 0, provider: 'voidaccess',
      summary: result.message || 'VoidAccess returned no result.',
    }];
  },
};
