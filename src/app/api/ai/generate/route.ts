import { NextRequest, NextResponse } from 'next/server';
import { getServerAiConfig, parseAiConfig } from '@/lib/ai/config';
import { generateWithRouting } from '@/lib/ai/local-model';
import { validateTaskOutput } from '@/lib/ai/task-validation';
import { AI_TASKS, type AiGenerationRequest } from '@/lib/ai/providers/types';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { authorizeAiRequest } from '@/lib/ai/access';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied = await authorizeAiRequest(request);
  if (denied) return denied;
  if (isRateLimited(getClientIp(request), 10, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  let body: { task?: string; input?: unknown; context?: unknown; config?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!AI_TASKS.includes(body.task as AiGenerationRequest['task'])) return NextResponse.json({ error: 'Unsupported AI task' }, { status: 400 });
  if (body.task==='grounded_qa') return NextResponse.json({error:'Use /api/knowledge/ask for RLS-protected retrieval and grounded citation validation.'},{status:400});
  const config = parseAiConfig(body.config) ?? getServerAiConfig();
  if (!config) return NextResponse.json({ error: 'No OpenAI-compatible AI provider configured' }, { status: 503 });
  const task = body.task as AiGenerationRequest['task'];
  if (!config.enabledTasks.includes(task)) return NextResponse.json({ error: 'This AI task is disabled' }, { status: 403 });
  try {
    const result = await generateWithRouting(config, { task, input: typeof body.input === 'string' ? body.input : undefined, context: body.context });
    validateTaskOutput(task,result.output);
    return NextResponse.json({ ...result, provider: 'openai-compatible', task, generatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: 'AI model unavailable or returned invalid output. Check the configured model and try again.', code: 'AI_UNAVAILABLE' }, { status: 502 });
  }
}
