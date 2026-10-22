import { NextResponse, type NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { headers, isDemoMode, jobError, systemContext } from '@/lib/jobfile/context';
import { organizationFromRecipients, parseInboundWebhook, verifyInboundSecret } from '@/lib/jobfile/intake/adapters';
import { receiveAndProcess } from '@/lib/jobfile/paper-desk';
export const dynamic = 'force-dynamic';

/** Inbound-email provider webhook. Authenticated with INBOUND_EMAIL_SECRET; tenant from the signed address. */
export async function POST(request: NextRequest) {
  try {
    const demo = isDemoMode();
    if (!demo && !process.env.INBOUND_EMAIL_SECRET) return NextResponse.json({ status: 'stub', error: 'Inbound email is not configured. Set INBOUND_EMAIL_SECRET and INBOUND_EMAIL_DOMAIN.' }, { status: 503, headers });
    if (!demo && !verifyInboundSecret(request.headers.get('authorization') ?? request.headers.get('x-ophanim-inbound-secret'))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
    const { input, recipients } = parseInboundWebhook(await boundedJson(request, 30 * 1024 * 1024));
    const organizationId = demo ? '' : organizationFromRecipients(recipients);
    if (organizationId === null) return NextResponse.json({ error: 'Recipient is not a known organization inbox.' }, { status: 422, headers });
    const ctx = await systemContext(organizationId);
    const result = await receiveAndProcess(ctx, input);
    return NextResponse.json({ intakeId: result.intake.id, status: result.intake.status, jobFileId: result.intake.matchedJobFileId, demo: ctx.actor.demo }, { headers });
  } catch (error) { return jobError(error); }
}
