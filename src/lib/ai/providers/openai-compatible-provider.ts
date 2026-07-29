import { validateHost } from '@/lib/ssrf-guard';
import { buildAiMessages } from '../task-policy';
import type { AiGenerationRequest, AiProvider, AiProviderConfig } from './types';

function endpoint(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid AI base URL');
  const path = url.pathname.replace(/\/$/, '');
  url.pathname = `${path.endsWith('/v1') ? path : `${path}/v1`}/chat/completions`;
  url.search = '';
  return url;
}

function isAllowedLocal(url: URL): boolean {
  const allowed = (process.env.AI_LOCAL_BASE_URLS ?? '').split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
  return allowed.includes(url.origin);
}

export async function validateAiBaseUrl(baseUrl: string): Promise<void> {
  const url = endpoint(baseUrl);
  if (isAllowedLocal(url)) return;
  const host = await validateHost(url.hostname);
  if (!host.ok) throw new Error('AI base URL is not permitted. Allow local URLs with AI_LOCAL_BASE_URLS.');
}

export const openAiCompatibleProvider: AiProvider = {
  name: 'openai-compatible',
  async generate(config: AiProviderConfig, request: AiGenerationRequest): Promise<string> {
    const url = endpoint(config.baseUrl);
    await validateAiBaseUrl(config.baseUrl);
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: buildAiMessages(request), temperature: 0.2 }),
    });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('AI provider returned an empty response');
    return content;
  },
};
