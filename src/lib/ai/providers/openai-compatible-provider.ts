import { validateHost } from '@/lib/ssrf-guard';
import { pinnedPublicFetch, type PinnedRequestOptions } from '@/lib/http/pinned-public-fetch';
import { buildAiMessages } from '../task-policy';
import type { AiGenerationRequest, AiProvider, AiProviderConfig } from './types';
import { TASK_SCHEMAS } from '../task-schemas';

function endpoint(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid AI base URL');
  const path = url.pathname.replace(/\/$/, '');
  url.pathname = `${path.endsWith('/v1') ? path : `${path}/v1`}/chat/completions`;
  url.search = '';
  return url;
}

function isAllowedLocal(url: URL): boolean {
  if (process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['11434', '1234'].includes(url.port)) return true;
  const allowed = (process.env.AI_LOCAL_BASE_URLS ?? '').split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
  return allowed.includes(url.origin);
}

export async function validateAiBaseUrl(baseUrl: string): Promise<void> {
  const url = endpoint(baseUrl);
  if (isAllowedLocal(url)) return;
  const host = await validateHost(url.hostname);
  if (!host.ok) throw new Error('AI base URL is not permitted. Allow local URLs with AI_LOCAL_BASE_URLS.');
}

export async function fetchAiEndpoint(input: string | URL, options: PinnedRequestOptions): Promise<Response> {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid AI endpoint');
  return isAllowedLocal(url)
    ? fetch(url, { method: options.method, headers: options.headers, body: options.body, redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) })
    : pinnedPublicFetch(url, options);
}

export const openAiCompatibleProvider: AiProvider = {
  name: 'openai-compatible',
  async generate(config: AiProviderConfig, request: AiGenerationRequest): Promise<string> {
    const url = endpoint(config.baseUrl);
    await validateAiBaseUrl(config.baseUrl);
    const init = {
      method: 'POST' as const,
      headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({ model: config.model, messages: buildAiMessages(request), temperature: 0.2, max_tokens: 1200, ...(TASK_SCHEMAS[request.task] ? { response_format: { type:'json_object' } } : {}) }),
    };
    const response = await fetchAiEndpoint(url, { ...init, timeoutMs: 120_000 });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('AI provider returned an empty response');
    return content;
  },
};
