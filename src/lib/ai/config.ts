import { AI_TASKS, type AiProviderConfig } from './providers/types';

function tasks(value: unknown): AiProviderConfig['enabledTasks'] {
  return Array.isArray(value) ? value.filter((task): task is AiProviderConfig['enabledTasks'][number] => AI_TASKS.includes(task as AiProviderConfig['enabledTasks'][number])) : [];
}

export function parseAiConfig(value: unknown): AiProviderConfig | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiProviderConfig>;
  if (typeof raw.apiKey !== 'string' || typeof raw.baseUrl !== 'string' || typeof raw.model !== 'string') return null;
  const config = { apiKey: raw.apiKey.trim(), baseUrl: raw.baseUrl.trim(), model: raw.model.trim(), enabledTasks: tasks(raw.enabledTasks) };
  return config.apiKey && config.baseUrl && config.model ? config : null;
}

export function getServerAiConfig(): AiProviderConfig | null {
  return parseAiConfig({
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL,
    enabledTasks: (process.env.AI_ENABLED_TASKS ?? '').split(',').map((value) => value.trim()),
  });
}
