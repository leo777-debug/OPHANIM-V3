import { openAiCompatibleProvider } from './openai-compatible-provider';
import type { AiProvider } from './types';

const providers: AiProvider[] = [openAiCompatibleProvider];

export function getAiProvider(name = 'openai-compatible'): AiProvider {
  const provider = providers.find((candidate) => candidate.name === name);
  if (!provider) throw new Error(`Unknown AI provider: ${name}`);
  return provider;
}
