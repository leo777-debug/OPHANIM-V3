import type { NextRequest } from 'next/server';
import { sameOrigin } from '@/lib/http/origin';
import { query } from '@/lib/jobfile/context';
import { can } from '@/lib/operations/authorization';
import { JobFileInputError } from '@/lib/jobfile/service';
import { jobView } from '@/lib/jobfile/view';
export const dynamic = 'force-dynamic';

/** Viewers and cross-site requests get a read-only view; same-origin writers also refresh predictions, flags and Today items. */
export const GET = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => query(request, 'shipment:read', async ctx => {
  const refresh = sameOrigin(request) && (ctx.actor.demo || can(ctx.actor, 'shipment:write'));
  const view = await jobView(ctx, (await params).id, { refresh });
  if (!view) throw new JobFileInputError('Job file not found.');
  return view;
});
