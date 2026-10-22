import { AI_TASKS, type AiProviderConfig } from './providers/types';

function tasks(value: unknown): AiProviderConfig['enabledTasks'] {
  return Array.isArray(value) ? value.filter((task): task is AiProviderConfig['enabledTasks'][number] => AI_TASKS.includes(task as AiProviderConfig['enabledTasks'][number])) : [];
}

export function parseAiConfig(value: unknown): AiProviderConfig | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiProviderConfig>;
  if ((raw.apiKey !== undefined && typeof raw.apiKey !== 'string') || typeof raw.baseUrl !== 'string' || typeof raw.model !== 'string') return null;
  const taskModels = raw.taskModels && typeof raw.taskModels==='object'
    ? Object.fromEntries(Object.entries(raw.taskModels).filter(([task,model])=>AI_TASKS.includes(task as typeof AI_TASKS[number]) && typeof model==='string' && model.trim()).map(([task,model])=>[task,model.trim()])) : undefined;
  const config = { apiKey: raw.apiKey?.trim() ?? '', baseUrl: raw.baseUrl.trim(), model: raw.model.trim(), enabledTasks: tasks(raw.enabledTasks), taskModels };
  return config.baseUrl && config.model ? config : null;
}

export function getServerAiConfig(): AiProviderConfig | null {
  return parseAiConfig({
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL,
    enabledTasks: (process.env.AI_ENABLED_TASKS ?? '').split(',').map((value) => value.trim()),
  });
}

/** Environment credentials always win and are never attached to browser-selected hosts. */
export function resolveAiConfig(preferences: unknown): AiProviderConfig | null {
  const server = getServerAiConfig();
  if (server) return server;
  if (!preferences || typeof preferences !== 'object') return null;
  return parseAiConfig({ ...preferences, apiKey: '' });
}
