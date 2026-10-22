import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { createDriverLink } from '@/lib/jobfile/congestion';
import { JobFileInputError, loadJob } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

/** Create a driver link for a truck leg (no app install, expires after the trip). */
export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const id = (await params).id, body = await boundedJson(request, 2000).catch(() => ({})) as { siteId?: string; legId?: string; driverLabel?: string; locationOptIn?: boolean; hours?: number };
  if (!await loadJob(ctx, id)) throw new JobFileInputError('Job file not found.');
  if (body.siteId && !(await ctx.repo.select('ophanim_sites', ctx.actor.organizationId, { id: body.siteId }, { shared: true })).length) throw new JobFileInputError('Unknown site.');
  const { link, path } = await createDriverLink(ctx, id, body);
  return { linkId: link.id, path, expiresAt: link.expiresAt, locationOptIn: link.locationOptIn };
}, 201);
