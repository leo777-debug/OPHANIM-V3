import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { researchInSandbox, sandboxResearchConfigured, validateSandboxResearchRequest } from '@/lib/ai/sandbox-research';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { isFeatureEnabled } from '@/lib/operations/feature-flags';
import { db } from '@/lib/watchlists/db';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { boundedJson } from '@/lib/http/body';
import { sameOrigin } from '@/lib/http/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 6, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers });
  try {
    const actor = await requireAuthenticatedActor(request, 'research:run');
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin research request rejected.' }, { status: 403, headers });
    if (!isFeatureEnabled('sandbox_research')) {
      return NextResponse.json({ error: 'Sandbox research is disabled for this Ophanim edition.' }, { status: 403, headers });
    }
    if (!sandboxResearchConfigured()) {
      return NextResponse.json({ error: 'Add your research service URL and dedicated token in Admin → Integrations.' }, { status: 503, headers });
    }
    let input;
    try { input = validateSandboxResearchRequest(await boundedJson(request, 16000)); }
    catch { return NextResponse.json({ error: 'Supply a bounded JSON request with a subject and confirm or assess_risk purpose.' }, { status: 400, headers }); }
    const research = await researchInSandbox(input);
    await db().query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, metadata)
       values ($1, $2, 'sandbox_research.completed', 'sandbox_research', $3)`,
      [actor.organizationId, actor.userId, JSON.stringify({ purpose: input.purpose, subject: input.subject, sourceCount: research.sources.length })],
    );
    return NextResponse.json({ research, sandbox: true, generatedAt: new Date().toISOString() }, { headers });
  } catch (error) {
    const accessError = error instanceof OrganizationAccessError;
    const message = accessError ? error.message : 'Research service not running, unavailable or unable to record this request. Check Admin → Integrations.';
    const status = accessError ? (message === 'Authentication is required.' ? 401 : 403) : 503;
    return NextResponse.json({ error: message }, { status, headers });
  }
}
