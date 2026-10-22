import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { approvePaper, draftPaper, PAPER_KINDS, type PaperKind } from '@/lib/jobfile/papers';
import { JobFileInputError } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

/** Draft a paper from the job file, or approve a draft (owner / operations manager). */
export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const id = (await params).id, body = await boundedJson(request, 2000).catch(() => null) as { action?: string; kind?: string; paperId?: string } | null;
  if (body?.action === 'draft' && PAPER_KINDS.includes(body.kind as PaperKind)) return draftPaper(ctx, id, body.kind as PaperKind);
  if (body?.action === 'approve' && body.paperId) return approvePaper(ctx, id, body.paperId);
  throw new JobFileInputError('Use action "draft" with kind, or "approve" with paperId.');
});
