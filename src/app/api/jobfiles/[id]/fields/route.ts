import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { confirmField } from '@/lib/jobfile/paper-desk';
import { JobFileInputError } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

/** One tap confirms a field; typing a value corrects it. */
export const POST = (request: NextRequest) => mutation(request, 'shipment:write', async ctx => {
  const body = await boundedJson(request, 4000).catch(() => null) as { fieldId?: string; action?: string; value?: string } | null;
  if (!body?.fieldId || !['confirm', 'correct', 'reject'].includes(body.action ?? '')) throw new JobFileInputError('fieldId and action (confirm, correct or reject) are required.');
  return confirmField(ctx, body.fieldId, body.action as 'confirm', typeof body.value === 'string' ? body.value : undefined);
});
