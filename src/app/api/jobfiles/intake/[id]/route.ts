import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { attachAndProcess, createFromIntakeAndProcess } from '@/lib/jobfile/paper-desk';
import { JobFileInputError, parseJobInput } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const id = (await params).id, body = await boundedJson(request, 16000).catch(() => null) as { action?: string; jobFileId?: string; job?: unknown } | null;
  if (body?.action === 'attach' && typeof body.jobFileId === 'string') return { job: await attachAndProcess(ctx, id, body.jobFileId) };
  if (body?.action === 'create') return { job: await createFromIntakeAndProcess(ctx, id, parseJobInput(body.job)) };
  throw new JobFileInputError('Use action "attach" with jobFileId, or "create" with job details.');
});
