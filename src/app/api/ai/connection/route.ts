import { NextRequest, NextResponse } from 'next/server';
import { parseAiConfig } from '@/lib/ai/config';
import { openAiCompatibleProvider } from '@/lib/ai/providers/openai-compatible-provider';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { AiProviderError } from '@/lib/ai/providers/provider-error';
import { availableAiModels } from '@/lib/ai/providers/models';

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 5, 60_000)) return NextResponse.json({ error: 'Please wait before testing again.' }, { status: 429 });
  let config;
  try { config = parseAiConfig(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid connection settings.' }, { status: 400 }); }
  if (!config) return NextResponse.json({ error: 'Enter a base URL and model name.' }, { status: 400 });
  let modelListSucceeded = false;
  let stage: 'model_access' | 'generation' = 'generation';
  try {
    const hostname = new URL(config.baseUrl).hostname;
    if (['api.mistral.ai', 'api.eu.mistral.ai'].includes(hostname)) {
      stage = 'model_access';
      const models = await availableAiModels(config);
      modelListSucceeded = true;
      if (!models.includes(config.model)) return NextResponse.json({ error: 'Mistral returned a model list, but the selected model is not in it. Use Load available models to select an exact model ID.', modelListSucceeded, stage }, { status: 400 });
      await new Promise(resolve => setTimeout(resolve, 1200));
      stage = 'generation';
    }
    await openAiCompatibleProvider.generate(config, { task: 'explain', input: 'Reply with: Connection successful.', maxOutputTokens: 64 });
    return NextResponse.json({ connected: true, model: config.model, modelListSucceeded });
  } catch (error) {
    const prefix = modelListSucceeded ? 'Mistral model-list access succeeded with the entered key, but text generation failed. ' : stage === 'model_access' ? 'Mistral model-list access failed before text generation. ' : '';
    if (error instanceof AiProviderError && error.status === 429) return NextResponse.json(
      { error: prefix + error.message, modelListSucceeded, stage }, { status: 429, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {} },
    );
    const message = error instanceof Error ? error.message : 'Connection failed';
    return NextResponse.json({ error: message === 'fetch failed'
      ? 'Cannot reach the model server from Ophanim. Start your model server and check its address. Localhost refers to the computer running the Ophanim backend.'
      : prefix + message, modelListSucceeded, stage }, { status: 502 });
  }
}
