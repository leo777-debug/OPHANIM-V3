import type { AiGenerationRequest, AiTask } from './providers/types';

const TASK_INSTRUCTIONS: Record<AiTask, string> = {
  summarize: 'Summarize only the supplied material. State uncertainty where material is incomplete.',
  explain: 'Explain only the supplied material in clear, factual language. Do not add facts.',
  suggest_follow_up_searches: 'Suggest up to five concise follow-up search queries. Do not perform, simulate, or claim to perform any search.',
  write_email_summary: 'Write a concise professional email summary from the supplied material. Do not send email.',
};

export function buildAiMessages(request: AiGenerationRequest): Array<{ role: 'system' | 'user'; content: string }> {
  const context = request.context === undefined ? '' : JSON.stringify(request.context).slice(0, 60_000);
  return [
    {
      role: 'system',
      content: `You are an Ophanim writing assistant. ${TASK_INSTRUCTIONS[request.task]} You have no tools, browsing, provider access, or search capability. Never attempt to call or choose a search provider.`,
    },
    { role: 'user', content: `TASK: ${request.task}\nINPUT:\n${request.input?.slice(0, 12_000) ?? ''}\n\nCONTEXT:\n${context}` },
  ];
}
