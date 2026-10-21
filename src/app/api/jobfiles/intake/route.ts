import type { NextRequest } from 'next/server';
import { mutation, query } from '@/lib/jobfile/context';
import { attachAndProcess, receiveAndProcess } from '@/lib/jobfile/paper-desk';
import { JobFileInputError, listIntake } from '@/lib/jobfile/service';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '@/lib/jobfile/storage';
import { textOf } from '@/lib/jobfile/intake/text';
import { isRateLimited } from '@/lib/ssrf-guard';
export const dynamic = 'force-dynamic';

export const GET = (request: NextRequest) => query(request, 'shipment:read', async ctx => ({ items: await listIntake(ctx, request.nextUrl.searchParams.get('status') ?? undefined) }));

/** In-app intake: phone photos, uploads, and forwarded text (also the WhatsApp/email stub). */
export const POST = (request: NextRequest) => mutation(request, 'shipment:write', async ctx => {
  if (Number(request.headers.get('content-length') ?? 0) > 6 * MAX_UPLOAD_BYTES) throw new JobFileInputError('Upload at most 60 MB at a time.');
  if (isRateLimited(`jobfile-intake:${ctx.actor.organizationId}`, 120)) throw new JobFileInputError('Too many uploads. Please retry in a minute.');
  const form = await request.formData().catch(() => { throw new JobFileInputError('Send multipart form data.'); });
  const channel = String(form.get('channel') ?? 'upload'), jobFileId = String(form.get('jobFileId') ?? '') || null, clientId = String(form.get('clientId') ?? '') || null;
  if (!['photo', 'upload', 'email', 'whatsapp'].includes(channel)) throw new JobFileInputError('Unknown intake channel.');
  const files = form.getAll('files').filter((item): item is File => item instanceof File).slice(0, 20);
  const attachments = [];
  for (const [index, file] of files.entries()) {
    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_UPLOAD_TYPES.has(mimeType) || file.size > MAX_UPLOAD_BYTES) throw new JobFileInputError('Photos (JPEG, PNG, WebP, HEIC), PDF or text up to 10 MB each.');
    const bytes = Buffer.from(await file.arrayBuffer());
    attachments.push({ fileName: file.name || `page-${index + 1}.jpg`, mimeType, bytes, text: textOf({ mimeType, bytes }) });
  }
  const bodyText = String(form.get('text') ?? '').slice(0, 20000);
  if (!attachments.length && !bodyText.trim()) throw new JobFileInputError('Add a photo, a file or some text.');
  const result = await receiveAndProcess(ctx, { channel: channel as 'photo', externalId: clientId ? `client:${clientId}` : null, sender: ctx.actor.displayName ?? null, subject: String(form.get('subject') ?? '') || null, bodyText, attachments });
  if (jobFileId && result.intake.matchedJobFileId !== jobFileId) await attachAndProcess(ctx, result.intake.id, jobFileId);
  return { intake: result.intake, decision: result.decision, createdJob: result.createdJob, documents: result.documents.map(document => ({ id: document.id, docTypeCode: document.docTypeCode })) };
}, 201);
