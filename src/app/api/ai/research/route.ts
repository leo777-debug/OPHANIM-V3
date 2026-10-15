import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { researchInSandbox, sandboxResearchConfigured, validateSandboxResearchRequest } from '@/lib/ai/sandbox-research';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { isFeatureEnabled } from '@/lib/operations/feature-flags';
import { db } from '@/lib/watchlists/db';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { authorizeAiRequest } from '@/lib/ai/access';
import { limitedRequestBytes, RequestBodyLimitError } from '@/lib/http/limited-form-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied=await authorizeAiRequest(request);if(denied)return denied;
  if (isRateLimited(getClientIp(request), 6, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  try {
    const actor = await requireAuthenticatedActor(request, 'research:run');
    if (!isFeatureEnabled('sandbox_research')) {
      return NextResponse.json({ error: 'Sandbox research is disabled for this Ophanim edition.' }, { status: 403 });
    }
    if (!sandboxResearchConfigured()) {
      return NextResponse.json({ error: 'Sandbox research is not configured for this deployment.' }, { status: 503 });
    }
    const input = validateSandboxResearchRequest(JSON.parse(Buffer.from(await limitedRequestBytes(request,32*1024)).toString('utf8')));
    const research = await researchInSandbox(input);
    await db().query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, metadata)
       values ($1, $2, 'sandbox_research.completed', 'sandbox_research', $3)`,
      [actor.organizationId, actor.userId, JSON.stringify({ purpose: input.purpose, subject: input.subject, sourceCount: research.sources.length })],
    );
    return NextResponse.json({ research, sandbox: true, generatedAt: new Date().toISOString() });
  } catch (error) {
    const message = 'Sandbox research failed';
    const status = error instanceof OrganizationAccessError ? (error.message === 'Authentication is required.' ? 401 : 403) : error instanceof RequestBodyLimitError ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
