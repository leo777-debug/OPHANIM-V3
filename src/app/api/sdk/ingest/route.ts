import { NextRequest, NextResponse } from 'next/server';
import { authorizeSdkRead, sdkOrganizationId } from '@/lib/integrations/sdk-access';
import { isRateLimited } from '@/lib/ssrf-guard';
import { boundedJson } from '@/lib/http/body';
import { ingestSdkEntities, sdkKeyMatches, sdkState } from '@/lib/sdk/ingestion';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** Machine-to-server ingestion. Diagnostic payloads exercise validation without adding map data. */
export async function POST(request: NextRequest) {
  if (!sdkOrganizationId() || !process.env.SDK_INGEST_KEY?.trim()) return NextResponse.json({ error: 'SDK service not configured. Add SDK settings in Admin → Integrations.' }, { status: 503, headers });
  let input: unknown;
  try { input = await boundedJson(request, 1000000); }
  catch (error) { return NextResponse.json({ error: error instanceof Error && error.message.includes('size limit') ? 'Payload too large.' : 'Provide a valid JSON payload.' }, { status: error instanceof Error && error.message.includes('size limit') ? 413 : 400, headers }); }
  const body = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const key = request.headers.get('authorization')?.replace(/^Bearer /i, '') ?? body.apiKey;
  if (!sdkKeyMatches(key)) return NextResponse.json({ error: 'Invalid API key.' }, { status: 401, headers });
  if (isRateLimited(`sdk-ingest:${sdkOrganizationId()}`, 30)) return NextResponse.json({ error: 'Rate limit reached.' }, { status: 429, headers });
  if (typeof body.source !== 'string' || !/^[a-z0-9_.-]{1,80}$/i.test(body.source) || !Array.isArray(body.entities) || body.entities.length > 500 || (body.diagnostic !== undefined && typeof body.diagnostic !== 'boolean')) return NextResponse.json({ error: 'Provide a source identifier and at most 500 entities; diagnostic must be boolean.' }, { status: 400, headers });
  return NextResponse.json(ingestSdkEntities(body.source, body.entities, body.diagnostic === true), { headers });
}

export async function GET(request: NextRequest) {
  const denied = await authorizeSdkRead(request); if (denied) return denied;
  const state = sdkState();
  return NextResponse.json({ sdk: 'polybolos', version: '1.0.0', entityCount: state.entities.size, recentIngestions: state.log.slice(-10), lastObservationReceivedAt: state.lastUpdate ? new Date(state.lastUpdate).toISOString() : null, storage: 'process-local, one configured organization; cleared on restart', timestamp: new Date().toISOString() }, { headers });
}
