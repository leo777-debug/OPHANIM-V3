import { NextRequest, NextResponse } from 'next/server';
import { parseAiConfig } from '@/lib/ai/config';
import { availableAiModels } from '@/lib/ai/providers/models';
import { AiProviderError } from '@/lib/ai/providers/provider-error';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 5, 60000)) return NextResponse.json({ error: 'Please wait before checking models again.' }, { status: 429 });
  const body: unknown = await request.json().catch(() => null);
  const config = parseAiConfig(body && typeof body === 'object' ? { ...body, model: 'model-discovery' } : null);
  if (!config) return NextResponse.json({ error: 'Enter a provider base URL.' }, { status: 400 });
  try {
    const models = await availableAiModels(config);
    return NextResponse.json({ models, message: models.length ? 'Model list received using the supplied credentials. This does not test generation quota.' : 'Provider returned no chat models.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof AiProviderError ? (error.status === 429 ? 429 : error.status === 401 || error.status === 403 ? error.status : 502) : 400;
    const safeMessages = new Set(['Enter your Mistral API key before loading models.', 'Paste the API key only, without the Bearer prefix.', 'The API key contains a line break. Paste the key on one line.', 'The API key contains an invalid character. Paste only the key.', 'Provider did not return a valid model list. Check the base URL.', 'Invalid AI base URL', 'AI base URL is not permitted. Allow local URLs with AI_LOCAL_BASE_URLS.']);
    const message = error instanceof AiProviderError && error.status === 401 ? 'Provider rejected the API key (401). Check the key entered in Ophanim.'
      : error instanceof AiProviderError ? error.message
      : error instanceof Error && safeMessages.has(error.message) ? error.message
      : 'Ophanim could not read the provider model-list endpoint. Check the base URL and connectivity.';
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
