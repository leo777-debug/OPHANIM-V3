import { aiAuthorization, aiEndpoint, validateAiBaseUrl } from './openai-compatible-provider';
import { providerError, readProviderJson } from './provider-error';
import type { AiProviderConfig } from './types';

export async function availableAiModels(config: AiProviderConfig): Promise<string[]> {
  await validateAiBaseUrl(config.baseUrl);
  const url = aiEndpoint(config.baseUrl, 'models');
  if (['api.mistral.ai', 'api.eu.mistral.ai'].includes(url.hostname) && !config.apiKey) {
    throw new Error('Enter your Mistral API key before loading models.');
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...aiAuthorization(config.apiKey) },
    redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  if (!response.ok) throw await providerError(response);
  const payload = await readProviderJson(response, 512 * 1024);
  const data = Array.isArray(payload) ? payload : payload && typeof payload === 'object' ? (payload as { data?: unknown }).data : null;
  if (!Array.isArray(data)) throw new Error('Provider did not return a valid model list. Check the base URL.');
  const models = new Set<string>();
  for (const value of data.slice(0, 1000)) {
    if (!value || typeof value !== 'object') continue;
    const model = value as { id?: unknown; aliases?: unknown; capabilities?: { completion_chat?: boolean } };
    if (model.capabilities?.completion_chat === false) continue;
    for (const id of [model.id, ...(Array.isArray(model.aliases) ? model.aliases : [])]) {
      if (typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\r\n]/.test(id) && !id.includes(config.apiKey || '\0')) models.add(id);
    }
  }
  return [...models].sort().slice(0, 200);
}
