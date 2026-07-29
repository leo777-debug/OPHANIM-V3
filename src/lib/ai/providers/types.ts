export const AI_TASKS = ['summarize', 'explain', 'suggest_follow_up_searches', 'write_email_summary'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  enabledTasks: AiTask[];
}

export interface AiGenerationRequest {
  task: AiTask;
  input?: string;
  context?: unknown;
}

export interface AiProvider {
  name: string;
  generate(config: AiProviderConfig, request: AiGenerationRequest): Promise<string>;
}
