import { AI_TASKS, type AiProviderConfig } from './providers/types';

export const AI_CONFIG_STORAGE = 'ophanim-ai-provider-config';

export function readClientAiConfig(): AiProviderConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(AI_CONFIG_STORAGE) ?? '') as AiProviderConfig;
    if (!value.apiKey || !value.baseUrl || !value.model || !Array.isArray(value.enabledTasks)) return null;
    return { ...value, enabledTasks: value.enabledTasks.filter((task) => AI_TASKS.includes(task)) };
  } catch { return null; }
}

export function writeClientAiConfig(config: AiProviderConfig): void {
  sessionStorage.setItem(AI_CONFIG_STORAGE, JSON.stringify(config));
}
