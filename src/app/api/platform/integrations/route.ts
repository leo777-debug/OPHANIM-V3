import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { platformError } from '@/lib/platform/http';
import { integrationStatuses, testIntegration } from '@/lib/integrations/status';
import { isRateLimited } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedActor(request, 'organization:manage');
    return NextResponse.json({ integrations: integrationStatuses(), observationStorage: 'process-local; clears on restart' }, { headers });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'organization:manage');
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Cross-origin test rejected.' }, { status: 403, headers });
    if (isRateLimited(`integration-test:${actor.organizationId}`, 10)) return NextResponse.json({ error: 'Test limit reached; wait a minute.' }, { status: 429, headers });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== 'string' || Object.keys(body).some(key => key !== 'id')) return NextResponse.json({ error: 'Supply only a registered integration id. Keys and URLs are not accepted.' }, { status: 400, headers });
    const integration = await testIntegration(body.id);
    return integration ? NextResponse.json({ integration }, { headers }) : NextResponse.json({ error: 'Unknown integration.' }, { status: 404, headers });
  } catch (error) { return platformError(error); }
}
