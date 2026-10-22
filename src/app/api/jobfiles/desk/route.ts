import type { NextRequest } from 'next/server';
import { query } from '@/lib/jobfile/context';
import { can } from '@/lib/operations/authorization';
import { myStats, searchDocuments, teamStats } from '@/lib/jobfile/paper-desk';
import type { ExtractedField, JobDocument, JobFile } from '@/lib/jobfile/types';
export const dynamic = 'force-dynamic';

/** Paper Desk: documents waiting for confirmation, search, my streak and (managers) team totals. */
export const GET = (request: NextRequest) => query(request, 'shipment:read', async ctx => {
  const org = ctx.actor.organizationId, q = request.nextUrl.searchParams.get('q') ?? '';
  const [suggested, documents, jobs] = await Promise.all([
    ctx.repo.select<ExtractedField>('ophanim_extracted_fields', org, { status: 'suggested' }, { limit: 2000 }),
    ctx.repo.select<JobDocument>('ophanim_documents', org, {}, { order: 'createdAt desc', limit: 500 }),
    ctx.repo.select<JobFile>('ophanim_job_files', org),
  ]);
  const waiting = new Set(suggested.map(field => field.documentId)), numbers = new Map(jobs.map(job => [job.id, job.jobNumber]));
  return {
    queue: documents.filter(document => waiting.has(document.id)).map(document => ({ id: document.id, jobFileId: document.jobFileId, jobNumber: numbers.get(document.jobFileId ?? '') ?? null, docTypeCode: document.docTypeCode, fileName: document.originalFileName, reader: document.reader, suggested: suggested.filter(field => field.documentId === document.id).length })),
    results: q ? await searchDocuments(ctx, q) : [],
    me: await myStats(ctx),
    team: can(ctx.actor, 'jobfile:approve') || ctx.actor.demo ? await teamStats(ctx) : null,
  };
});
