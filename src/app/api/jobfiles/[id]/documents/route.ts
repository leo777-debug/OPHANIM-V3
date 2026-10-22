import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { processDocument } from '@/lib/jobfile/paper-desk';
import { JobFileInputError } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

/** Re-read a document (e.g. after a vision model or Tesseract is configured). */
export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const id = (await params).id, body = await boundedJson(request, 2000).catch(() => null) as { documentId?: string } | null;
  if (!body?.documentId) throw new JobFileInputError('documentId is required.');
  const [document] = await ctx.repo.select<{ jobFileId: string | null }>('ophanim_documents', ctx.actor.organizationId, { id: body.documentId, jobFileId: id });
  if (!document) throw new JobFileInputError('Document not found on this job.');
  const result = await processDocument(ctx, body.documentId);
  return { reader: result.reader, docType: result.docType, fields: result.fields, note: result.note };
});
