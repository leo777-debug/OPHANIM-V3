import { NextRequest, NextResponse } from 'next/server';
import { parseAiConfig } from '@/lib/ai/config';
import { openAiCompatibleProvider } from '@/lib/ai/providers/openai-compatible-provider';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 5, 60_000)) return NextResponse.json({ error: 'Please wait before testing again.' }, { status: 429 });
  let config;
  try { config = parseAiConfig(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid connection settings.' }, { status: 400 }); }
  if (!config) return NextResponse.json({ error: 'Enter a base URL and model name.' }, { status: 400 });
  try {
    await openAiCompatibleProvider.generate(config, { task: 'explain', input: 'Reply with: Connection successful.' });
    return NextResponse.json({ connected: true, model: config.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return NextResponse.json({ error: message === 'fetch failed'
      ? 'Cannot reach the model server from Ophanim. Start your model server and check its address. Localhost refers to the computer running the Ophanim backend.'
      : message }, { status: 502 });
  }
}
