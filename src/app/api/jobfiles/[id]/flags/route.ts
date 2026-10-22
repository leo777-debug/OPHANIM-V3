import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { resolveFlag } from '@/lib/jobfile/paper-desk';
import { JobFileInputError } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

/** Fix, accept (remembered for this client) or dismiss a flag. Fixing returns a 30-second lesson. */
export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const body = await boundedJson(request, 4000).catch(() => null) as { flagId?: string; status?: string } | null;
  if (!body?.flagId || !['fixed', 'accepted_difference', 'false_alarm'].includes(body.status ?? '')) throw new JobFileInputError('flagId and status are required.');
  return resolveFlag(ctx, (await params).id, body.flagId, body.status as 'fixed');
});
