import { validateHost } from '@/lib/ssrf-guard';
import { buildAiMessages } from '../task-policy';
import type { AiGenerationRequest, AiProvider, AiProviderConfig } from './types';
import { TASK_SCHEMAS } from '../task-schemas';
import { providerError } from './provider-error';

export function aiEndpoint(baseUrl: string, resource: 'chat/completions' | 'models' = 'chat/completions'): URL {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid AI base URL');
  const path = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '');
  url.pathname = `${path.endsWith('/v1') ? path : `${path}/v1`}/${resource}`;
  url.search = '';
  return url;
}

function isAllowedLocal(url: URL): boolean {
  if (process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['11434', '1234'].includes(url.port)) return true;
  const allowed = (process.env.AI_LOCAL_BASE_URLS ?? '').split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
  return allowed.includes(url.origin);
}

export async function validateAiBaseUrl(baseUrl: string): Promise<void> {
  const url = aiEndpoint(baseUrl);
  if (isAllowedLocal(url)) return;
  const host = await validateHost(url.hostname);
  if (!host.ok) throw new Error('AI base URL is not permitted. Allow local URLs with AI_LOCAL_BASE_URLS.');
}

export function aiAuthorization(apiKey: string): Record<string, string> {
  const key = apiKey.trim();
  if (/^Bearer\s/i.test(key)) throw new Error('Paste the API key only, without the Bearer prefix.');
  if (/[\r\n]/.test(key)) throw new Error('The API key contains a line break. Paste the key on one line.');
  if (/[^\x20-\x7e]/.test(key)) throw new Error('The API key contains an invalid character. Paste only the key.');
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export const openAiCompatibleProvider: AiProvider = {
  name: 'openai-compatible',
  async generate(config: AiProviderConfig, request: AiGenerationRequest): Promise<string> {
    const url = aiEndpoint(config.baseUrl);
    await validateAiBaseUrl(config.baseUrl);
    const budget = typeof request.maxOutputTokens === 'number' && Number.isFinite(request.maxOutputTokens) ? Math.max(32, Math.min(2048, Math.floor(request.maxOutputTokens))) : 1024;
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000),
      headers: { 'Content-Type': 'application/json', ...aiAuthorization(config.apiKey) },
      body: JSON.stringify({ model: config.model, messages: buildAiMessages(request), temperature: 0.2, max_tokens: budget, ...(TASK_SCHEMAS[request.task] ? { response_format: { type: 'json_object' } } : {}) }),
    });
    if (!response.ok) throw await providerError(response);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('AI provider returned an empty response');
    return content;
  },
};
