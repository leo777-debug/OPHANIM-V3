export const AI_TASKS = ['summarize', 'explain', 'suggest_follow_up_searches', 'write_email_summary',
  'extract_awb', 'extract_bill_of_lading', 'extract_invoice', 'extract_packing_list', 'extract_booking_confirmation', 'extract_arrival_notice', 'extract_delivery_order',
  'understand_email', 'classify_document', 'grounded_qa', 'parse_claim', 'explain_mistake', 'flag_incident', 'summarise_event', 'forecast', 'parse_watch'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  enabledTasks: AiTask[];
  taskModels?: Partial<Record<AiTask, string>>;
}

export interface AiGenerationRequest {
  task: AiTask;
  input?: string;
  context?: unknown;
  mode?: 'logistics' | 'general';
  maxOutputTokens?: number;
}

export interface AiProvider {
  name: string;
  generate(config: AiProviderConfig, request: AiGenerationRequest): Promise<string>;
}
