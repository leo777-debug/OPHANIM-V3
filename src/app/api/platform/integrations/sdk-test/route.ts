import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { sdkOrganizationId } from '@/lib/integrations/sdk-access';
import { isRateLimited } from '@/lib/ssrf-guard';
import { boundedJson } from '@/lib/http/body';
import { sameOrigin } from '@/lib/http/origin';
import { writeRuntimeValue } from '@/lib/runtime/store';
import { POST as ingest } from '@/app/api/sdk/ingest/route';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'organization:manage');
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin test rejected.' }, { status: 403, headers });
    if (isRateLimited(`sdk-setup:${actor.organizationId}`, 5)) return NextResponse.json({ error: 'Test limit reached. Wait a minute.' }, { status: 429, headers });
    const body = await boundedJson(request, 1000);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return NextResponse.json({ error: 'Send an empty object. Credentials, entities and URLs are not accepted.' }, { status: 400, headers });
    if (!sdkOrganizationId() || !process.env.SDK_INGEST_KEY?.trim()) return NextResponse.json({ error: 'SDK service not configured. Add SDK settings in Admin → Integrations.' }, { status: 503, headers });
    if (sdkOrganizationId() !== actor.organizationId) return NextResponse.json({ error: 'This SDK worker belongs to another organization.' }, { status: 403, headers });
    const response = await ingest(new NextRequest('http://sdk.internal/api/sdk/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SDK_INGEST_KEY}` }, body: JSON.stringify({ source: 'setup-diagnostic', diagnostic: true, entities: [{ id: 'setup-only', name: 'SYNTHETIC SETUP TEST — never stored or mapped', domain: 'LAND', entityType: 'FACILITY', position: { lat: 0, lng: 0 } }] }) }));
    if (!response.ok) return NextResponse.json({ error: 'SDK diagnostic was rejected. Check the server configuration and ingestion rate limit.' }, { status: response.status, headers });
    const receipt = await response.json();
    if (receipt.accepted !== 1 || receipt.rejected !== 0 || receipt.diagnostic !== true) return NextResponse.json({ error: 'SDK diagnostic validation failed.' }, { status: 502, headers });
    const result = { checkedAt: receipt.timestamp, accepted: 1, diagnostic: true, message: 'Server credential and ingestion validation passed. The synthetic event was not stored, mapped or streamed. This does not verify your external sender or multi-worker delivery.' };
    const persistence = await writeRuntimeValue('sdk-setup-tests', actor.organizationId, result);
    return NextResponse.json({ ...result, storage: persistence.storage, storageWarning: persistence.warning }, { headers });
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? error.message === 'Authentication is required.' ? 401 : 403 : 400;
    return NextResponse.json({ error: status === 401 ? 'Sign in to see your organization’s data.' : status === 403 ? 'Organization administration access is required.' : 'SDK setup test unavailable. Check the request and server configuration.' }, { status, headers });
  }
}
