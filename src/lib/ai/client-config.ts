import type { AiProviderConfig } from './providers/types';
import { parseAiConfig } from './config';

export const AI_CONFIG_STORAGE = 'ophanim-ai-provider-config';

export function readClientAiConfig(): AiProviderConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(AI_CONFIG_STORAGE) ?? '') as AiProviderConfig;
    return parseAiConfig(value);
  } catch { return null; }
}

export function writeClientAiConfig(config: AiProviderConfig): void {
  sessionStorage.setItem(AI_CONFIG_STORAGE, JSON.stringify(config));
}
