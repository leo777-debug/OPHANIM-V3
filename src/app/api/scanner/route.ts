import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { isRateLimited } from '@/lib/ssrf-guard';
import { boundedJson } from '@/lib/http/body';
import { sameOrigin } from '@/lib/http/origin';
import { scannerConfiguration, scannerInput, inspectApprovedTarget } from '@/lib/integrations/scanner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  return NextResponse.json({ error: 'Use an authenticated POST for an operator-approved HTTPS inspection.' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'cyber:write');
    if (actor.authProvider === 'presentation-demo' || !sameOrigin(request)) return NextResponse.json({ error: 'Inspection access denied.' }, { status: 403, headers });
    const config = scannerConfiguration();
    if (!config) return NextResponse.json({ error: 'Configure the Recon service, dedicated token, organization and authorized hosts in Admin → Integrations.', setupHref: '/admin/integrations' }, { status: 503, headers });
    if (actor.organizationId !== config.organizationId) return NextResponse.json({ error: 'Inspection service is unavailable for this organization.' }, { status: 403, headers });
    if (isRateLimited(`recon:${actor.organizationId}:${actor.userId}`, 5, 60000)) return NextResponse.json({ error: 'Inspection limit reached. Try later.' }, { status: 429, headers });
    let input;
    try { input = scannerInput(await boundedJson(request, 2000)); } catch { /* Fixed error below. */ }
    if (!input) return NextResponse.json({ error: 'Use an approved hostname or IPv4 address and quick, headers, ssl or tech mode. URLs, wildcards and port scans are unsupported.' }, { status: 400, headers });
    if (!config.targets.includes(input.target)) return NextResponse.json({ error: 'Target is not approved by the operator for this organization.' }, { status: 403, headers });
    return NextResponse.json(await inspectApprovedTarget(config, input), { headers });
  } catch (error) {
    if (error instanceof OrganizationAccessError) return NextResponse.json({ error: error.message,
      ...(error.message === 'Authentication is required.' ? { signInHref: '/login?returnTo=%2Fatlas' } : {}) }, { status: error.message === 'Authentication is required.' ? 401 : 403, headers });
    return NextResponse.json({ error: 'Inspection service unavailable, blocked or timed out. Check Admin → Integrations.' }, { status: 503, headers });
  }
}
