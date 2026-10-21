import { NextResponse, type NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { sameOrigin } from '@/lib/http/origin';
import { demoContext, headers, isDemoMode, jobError } from '@/lib/jobfile/context';
import { driverTap, resolveDriverLink } from '@/lib/jobfile/congestion';
import { postgresRepo } from '@/lib/jobfile/repo';
import { isRateLimited } from '@/lib/ssrf-guard';
import type { Ctx } from '@/lib/jobfile/types';
export const dynamic = 'force-dynamic';

async function linkContext(token: string) {
  const repo = isDemoMode() ? (await demoContext()).repo : postgresRepo();
  const resolved = await resolveDriverLink({ repo }, token);
  if (!resolved) return null;
  const ctx: Ctx = { repo, actor: { organizationId: resolved.organizationId, userId: '00000000-0000-0000-0000-000000000000', role: 'viewer', demo: isDemoMode(), system: true } };
  return { ctx, link: resolved.link };
}

/** The driver sees only their trip: job number, location consent and what they already tapped. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const found = await linkContext((await params).token);
    if (!found) return NextResponse.json({ error: 'This link has expired.' }, { status: 404, headers });
    const [job] = await found.ctx.repo.select<{ jobNumber: string; isSynthetic: boolean }>('ophanim_job_files', found.ctx.actor.organizationId, { id: found.link.jobFileId });
    const events = await found.ctx.repo.select<{ event: string; at: string }>('ophanim_site_events', found.ctx.actor.organizationId, { driverLinkId: found.link.id }, { order: 'at' });
    return NextResponse.json({ jobNumber: job?.jobNumber, synthetic: job?.isSynthetic ?? false, locationOptIn: found.link.locationOptIn, expiresAt: found.link.expiresAt, events: events.map(item => ({ event: item.event, at: item.at })) }, { headers });
  } catch (error) { return jobError(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403, headers });
    const token = (await params).token;
    if (isRateLimited(`driver:${token.slice(-12)}`, 30)) return NextResponse.json({ error: 'Please wait a moment.' }, { status: 429, headers });
    const found = await linkContext(token);
    if (!found) return NextResponse.json({ error: 'This link has expired.' }, { status: 404, headers });
    const body = await boundedJson(request, 1000).catch(() => ({})) as { event?: 'arrived' | 'loaded' | 'left'; latitude?: number; longitude?: number; consent?: boolean };
    const event = await driverTap(found.ctx, found.link, { event: body.event as 'arrived', latitude: body.latitude, longitude: body.longitude, consent: body.consent === true });
    return NextResponse.json({ ok: true, at: event.at }, { headers });
  } catch (error) { return jobError(error); }
}
