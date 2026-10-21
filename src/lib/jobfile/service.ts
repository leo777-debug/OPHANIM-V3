// Job file core: create jobs, keep the key ring, take in email/photo/WhatsApp
// items, match them to jobs and keep an audit trail.
import { findReferences, REFERENCE_TYPES, validateReference, type FoundReference, type ReferenceType } from './identifiers';
import { makeFlag } from './checks';
import { matchReferences, type MatchDecision } from './matching';
import { putFile, sha256, storageKey } from './storage';
import type { Activity, Ctx, FlagRecord, IntakeItem, JobDocument, JobFile, JobLeg, JobMilestone, JobMode, JobReference, PieceCount, Invoice } from './types';
import { JOB_MODES } from './types';
import { classifyDocument } from './document-types';

export class JobFileInputError extends Error {}
const now = (ctx: Ctx) => new Date(ctx.now?.() ?? Date.now()).toISOString();
const org = (ctx: Ctx) => ctx.actor.organizationId;
/** Real user id for audit/ownership; demo and system (webhook) actors have none. */
export const userOf = (ctx: Ctx) => ctx.actor.demo || ctx.actor.system ? null : ctx.actor.userId;
const text = (value: unknown, max = 240) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

export async function audit(ctx: Ctx, action: string, subjectType: string, subjectId: string | null, metadata: Record<string, unknown> = {}) {
  await ctx.repo.insert('ophanim_audit_events', org(ctx), { actorUserId: userOf(ctx), action, subjectType, subjectId, metadata: { ...metadata, at: now(ctx) } });
}

export type JobInput = { jobNumber?: string; mode: JobMode; clientName?: string; origin?: string; destination?: string; plannedDepartureAt?: string; plannedArrivalAt?: string; goodsDescription?: string; createdFrom?: string; isSynthetic?: boolean; references?: Array<{ type: ReferenceType; value: string }> };
export function parseJobInput(value: unknown): JobInput {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!JOB_MODES.includes(input.mode as JobMode)) throw new JobFileInputError(`Mode must be one of ${JOB_MODES.join(', ')}.`);
  const date = (key: string) => { const raw = text(input[key], 40); if (!raw) return undefined; const at = Date.parse(raw); if (!Number.isFinite(at)) throw new JobFileInputError(`${key} must be a date.`); return new Date(at).toISOString(); };
  const references = Array.isArray(input.references) ? input.references.slice(0, 40).map(item => {
    const ref = item as Record<string, unknown>;
    if (!REFERENCE_TYPES.includes(ref.type as ReferenceType) || !text(ref.value, 80)) throw new JobFileInputError('Each reference needs a known type and a value.');
    return { type: ref.type as ReferenceType, value: text(ref.value, 80)! };
  }) : [];
  return { jobNumber: text(input.jobNumber, 64) ?? undefined, mode: input.mode as JobMode, clientName: text(input.clientName) ?? undefined, origin: text(input.origin, 80) ?? undefined, destination: text(input.destination, 80) ?? undefined,
    plannedDepartureAt: date('plannedDepartureAt'), plannedArrivalAt: date('plannedArrivalAt'), goodsDescription: text(input.goodsDescription, 500) ?? undefined, references };
}

async function nextJobNumber(ctx: Ctx) {
  const jobs = await ctx.repo.select<JobFile>('ophanim_job_files', org(ctx));
  const highest = jobs.reduce((max, job) => Math.max(max, Number(job.jobNumber.match(/(\d+)$/)?.[1] ?? 0)), 1000);
  return `JF-${highest + 1}`;
}

export async function createJobFile(ctx: Ctx, input: JobInput): Promise<JobFile> {
  const job = await ctx.repo.insert<JobFile>('ophanim_job_files', org(ctx), {
    jobNumber: input.jobNumber ?? await nextJobNumber(ctx), mode: input.mode, status: 'open', clientName: input.clientName ?? null, origin: input.origin ?? null, destination: input.destination ?? null,
    plannedDepartureAt: input.plannedDepartureAt ?? null, plannedArrivalAt: input.plannedArrivalAt ?? null, goodsDescription: input.goodsDescription ?? null,
    createdFrom: input.createdFrom ?? 'manual', isSynthetic: input.isSynthetic ?? ctx.actor.demo, createdByUserId: userOf(ctx),
    shipmentId: null, clientCounterpartyId: null, declaredValue: null, currency: null, assignedUserId: null,
  });
  for (const reference of input.references ?? []) await addReference(ctx, job.id, reference.type, reference.value, 'manual');
  await audit(ctx, 'job_file.created', 'job_file', job.id, { jobNumber: job.jobNumber, createdFrom: job.createdFrom });
  return job;
}

/** Add a reference to the key ring. Invalid numbers are kept but flagged. */
export async function addReference(ctx: Ctx, jobFileId: string, type: ReferenceType, value: string, source: string): Promise<JobReference> {
  const validation = validateReference(type, value);
  const existing = await ctx.repo.select<JobReference>('ophanim_job_references', org(ctx), { jobFileId, type, normalizedValue: validation.normalized });
  if (existing[0]) return existing[0];
  const reference = await ctx.repo.insert<JobReference>('ophanim_job_references', org(ctx), { jobFileId, type, value, normalizedValue: validation.normalized, validated: validation.valid, validationCode: validation.code ?? null, source });
  if (!validation.valid && (type === 'container' || type === 'awb')) {
    const code = type === 'container' ? 'container_check_digit' : 'awb_check_digit';
    await saveFlags(ctx, jobFileId, [makeFlag(code, validation.code === 'unknown_prefix' ? 'warn' : 'block', `${code}:${jobFileId}:${validation.normalized}`, { value: validation.normalized, detail: validation.detail ?? '' })], { replaceCodes: [] });
  }
  await audit(ctx, 'job_reference.added', 'job_file', jobFileId, { type, value: validation.normalized, valid: validation.valid, source });
  return reference;
}

/** Upsert flags by fingerprint, keeping human resolutions. Open flags of `replaceCodes` that no longer fire are closed as fixed. */
export async function saveFlags(ctx: Ctx, jobFileId: string | null, flags: ReturnType<typeof makeFlag>[], options: { replaceCodes: string[] | 'all' }) {
  const existing = await ctx.repo.select<FlagRecord>('ophanim_job_checks', org(ctx), jobFileId ? { jobFileId } : {});
  const byFingerprint = new Map(existing.map(flag => [flag.fingerprint, flag]));
  const raised: FlagRecord[] = [];
  for (const flag of flags) {
    if (byFingerprint.has(flag.fingerprint)) continue;
    raised.push(await ctx.repo.insert<FlagRecord>('ophanim_job_checks', org(ctx), {
      jobFileId, documentIds: flag.documentIds, checkCode: flag.code, severity: flag.severity, messageEn: flag.message.en, messageAr: flag.message.ar, whyEn: flag.why.en, whyAr: flag.why.ar,
      fixEn: flag.fix.en, fixAr: flag.fix.ar, details: { params: flag.params, fields: flag.fields }, fingerprint: flag.fingerprint, status: 'open', raisedForUserId: userOf(ctx),
    }));
  }
  const fired = new Set(flags.map(flag => flag.fingerprint));
  for (const flag of existing) {
    if (flag.status !== 'open' || fired.has(flag.fingerprint)) continue;
    if (options.replaceCodes === 'all' || options.replaceCodes.includes(flag.checkCode)) {
      await ctx.repo.update('ophanim_job_checks', org(ctx), { id: flag.id }, { status: 'fixed', resolvedAt: now(ctx) });
      await audit(ctx, 'flag.auto_fixed', 'job_file', jobFileId, { flagId: flag.id, code: flag.checkCode });
    }
  }
  for (const flag of raised) await audit(ctx, 'flag.raised', 'job_file', jobFileId, { flagId: flag.id, code: flag.checkCode, severity: flag.severity });
  return raised;
}

export type JobAggregate = {
  job: JobFile; references: JobReference[]; legs: JobLeg[]; milestones: JobMilestone[]; pieces: PieceCount[]; documents: JobDocument[]; flags: FlagRecord[];
  invoices: Invoice[]; activity: Activity[];
};
export async function loadJob(ctx: Ctx, id: string): Promise<JobAggregate | null> {
  const [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org(ctx), { id });
  if (!job) return null;
  const where = { jobFileId: id };
  const [references, legs, milestones, pieces, documents, fields, flags, invoices, activity] = await Promise.all([
    ctx.repo.select<JobReference>('ophanim_job_references', org(ctx), where, { order: 'createdAt' }),
    ctx.repo.select<JobLeg>('ophanim_job_legs', org(ctx), where, { order: 'sequence' }),
    ctx.repo.select<JobMilestone>('ophanim_job_milestones', org(ctx), where, { order: 'sequence' }),
    ctx.repo.select<PieceCount>('ophanim_job_piece_counts', org(ctx), where, { order: 'recordedAt' }),
    ctx.repo.select<JobDocument>('ophanim_documents', org(ctx), where, { order: 'createdAt' }),
    ctx.repo.select<NonNullable<JobDocument['fields']>[number]>('ophanim_extracted_fields', org(ctx), where),
    ctx.repo.select<FlagRecord>('ophanim_job_checks', org(ctx), where, { order: 'createdAt desc' }),
    ctx.repo.select<Invoice>('ophanim_invoices', org(ctx), where, { order: 'createdAt' }),
    ctx.repo.select<Activity>('ophanim_audit_events', org(ctx), { subjectId: id }, { order: 'createdAt desc', limit: 200 }),
  ]);
  for (const document of documents) document.fields = fields.filter(field => field.documentId === document.id);
  return { job, references, legs, milestones, pieces, documents, flags, invoices, activity };
}

export async function listJobs(ctx: Ctx) {
  const [jobs, flags, references] = await Promise.all([
    ctx.repo.select<JobFile>('ophanim_job_files', org(ctx), {}, { order: 'createdAt desc', limit: 500 }),
    ctx.repo.select<FlagRecord>('ophanim_job_checks', org(ctx), { status: 'open' }),
    ctx.repo.select<JobReference>('ophanim_job_references', org(ctx)),
  ]);
  return jobs.map(job => ({ ...job, openFlags: flags.filter(flag => flag.jobFileId === job.id).length, blockFlags: flags.filter(flag => flag.jobFileId === job.id && flag.severity === 'block').length,
    references: references.filter(reference => reference.jobFileId === job.id).map(reference => ({ type: reference.type, value: reference.normalizedValue, validated: reference.validated })) }));
}

export async function keyRing(ctx: Ctx) {
  const [references, jobs] = await Promise.all([ctx.repo.select<JobReference>('ophanim_job_references', org(ctx)), ctx.repo.select<JobFile>('ophanim_job_files', org(ctx))]);
  const numbers = new Map(jobs.filter(job => !['closed', 'cancelled'].includes(job.status)).map(job => [job.id, job.jobNumber]));
  return references.filter(reference => numbers.has(reference.jobFileId)).map(reference => ({ jobFileId: reference.jobFileId, jobNumber: numbers.get(reference.jobFileId)!, type: reference.type, normalizedValue: reference.normalizedValue }));
}

export type IntakeAttachment = { fileName: string; mimeType: string; bytes: Buffer; text?: string };
export type IntakeInput = { channel: IntakeItem['channel']; externalId?: string | null; sender?: string | null; subject?: string | null; bodyText?: string | null; receivedAt?: string; attachments: IntakeAttachment[] };
export type IntakeResult = { intake: IntakeItem; decision: MatchDecision; documents: JobDocument[]; createdJob: JobFile | null };

/** Store an email/WhatsApp/photo item and its files, then match it to a job. */
export async function receiveIntake(ctx: Ctx, input: IntakeInput, options: { autoCreateFromPreAlert?: boolean } = {}): Promise<IntakeResult> {
  if (input.externalId) {
    const [duplicate] = await ctx.repo.select<IntakeItem>('ophanim_intake_items', org(ctx), { channel: input.channel, externalId: input.externalId });
    if (duplicate) return { intake: duplicate, decision: { status: duplicate.status === 'matched' ? 'matched' : 'review', jobFileId: duplicate.matchedJobFileId, candidates: duplicate.matchCandidates as MatchDecision['candidates'], reason: 'single_strong_match' }, documents: [], createdJob: null };
  }
  const corpus = [input.subject, input.bodyText, ...input.attachments.map(item => item.text), ...input.attachments.map(item => item.fileName)].filter(Boolean).join('\n');
  const found = findReferences(corpus);
  const decision = matchReferences(found, await keyRing(ctx));
  let intake = await ctx.repo.insert<IntakeItem>('ophanim_intake_items', org(ctx), {
    channel: input.channel, externalId: input.externalId ?? null, sender: text(input.sender, 320), subject: text(input.subject, 500), bodyText: input.bodyText?.slice(0, 100000) ?? null,
    receivedAt: input.receivedAt ?? now(ctx), status: decision.status === 'matched' ? 'matched' : 'review', matchedJobFileId: decision.jobFileId,
    referencesFound: found.map(item => ({ type: item.type, value: item.validation.normalized, valid: item.validation.valid, code: item.validation.code ?? null })), matchCandidates: decision.candidates,
  });
  const documents: JobDocument[] = [];
  for (const attachment of input.attachments) documents.push(await storeDocument(ctx, { jobFileId: decision.jobFileId, intakeItemId: intake.id, receivedVia: input.channel, ...attachment }));
  let createdJob: JobFile | null = null, jobFileId = decision.jobFileId;
  const strong = found.filter(item => item.validation.valid && ['awb', 'bl', 'container'].includes(item.type));
  if (!jobFileId && decision.reason === 'no_match' && options.autoCreateFromPreAlert !== false && strong.length && /PRE[- ]?ALERT|ARRIVAL NOTICE|SHIPPING ADVICE/i.test(corpus)) {
    createdJob = await createJobFile(ctx, { mode: inferMode(found, corpus), createdFrom: input.channel === 'email' ? 'email' : input.channel === 'whatsapp' ? 'whatsapp' : 'photo', references: [] });
    jobFileId = createdJob.id;
    intake = (await ctx.repo.update<IntakeItem>('ophanim_intake_items', org(ctx), { id: intake.id }, { status: 'created_job', matchedJobFileId: jobFileId }))[0];
    for (const document of documents) { await ctx.repo.update('ophanim_documents', org(ctx), { id: document.id }, { jobFileId }); document.jobFileId = jobFileId; }
  }
  if (jobFileId) await adoptReferences(ctx, jobFileId, found, input.channel);
  await audit(ctx, 'intake.received', 'job_file', jobFileId, { intakeId: intake.id, channel: input.channel, status: intake.status, reason: decision.reason, documents: documents.length });
  return { intake, decision, documents, createdJob };
}

function inferMode(found: FoundReference[], corpus: string): JobMode {
  const air = found.some(item => item.type === 'awb' || item.type === 'hawb'), exportish = /\b(EXPORT|TAKE ?OFF|DEPARTURE FROM (DXB|DWC|AUH|SHJ))\b/i.test(corpus);
  return air ? (exportish ? 'air_export' : 'air_import') : (exportish ? 'sea_export' : 'sea_import');
}
async function adoptReferences(ctx: Ctx, jobFileId: string, found: FoundReference[], source: string) {
  for (const item of found) await addReference(ctx, jobFileId, item.type, item.value, source);
}

export async function storeDocument(ctx: Ctx, input: IntakeAttachment & { jobFileId: string | null; intakeItemId?: string | null; receivedVia: string; previousVersionId?: string | null }): Promise<JobDocument> {
  const key = storageKey(org(ctx), input.jobFileId ?? `intake-${input.intakeItemId ?? 'upload'}`, input.fileName);
  await putFile(key, input.bytes, input.mimeType, ctx.actor.demo);
  const classified = input.text ? classifyDocument(input.text) : { code: 'other', confidence: 0 };
  let versionNumber = 1;
  if (input.previousVersionId) { const [previous] = await ctx.repo.select<JobDocument>('ophanim_documents', org(ctx), { id: input.previousVersionId }); versionNumber = (previous?.versionNumber ?? 0) + 1; }
  const document = await ctx.repo.insert<JobDocument>('ophanim_documents', org(ctx), {
    jobFileId: input.jobFileId, intakeItemId: input.intakeItemId ?? null, docTypeCode: classified.code, documentType: legacyType(classified.code), originalFileName: input.fileName.slice(0, 255), storageBucket: 'ophanim-private', storagePath: key,
    mimeType: input.mimeType, fileSizeBytes: input.bytes.length, fileSha256: sha256(input.bytes), status: 'stored', receivedVia: input.receivedVia, receivedAt: now(ctx), versionNumber, previousVersionId: input.previousVersionId ?? null,
    classificationConfidence: classified.confidence, textContent: input.text?.slice(0, 200000) ?? null, createdByUserId: userOf(ctx),
  });
  await audit(ctx, 'document.stored', 'job_file', input.jobFileId, { documentId: document.id, type: classified.code, version: versionNumber });
  return document;
}
const legacyType = (code: string) => code === 'bill_of_lading' ? 'bill_of_lading' : code === 'commercial_invoice' ? 'invoice' : 'other';

export async function listIntake(ctx: Ctx, status?: string) {
  return ctx.repo.select<IntakeItem>('ophanim_intake_items', org(ctx), status ? { status } : {}, { order: 'receivedAt desc', limit: 200 });
}
/** Attach a reviewed intake item (and its documents) to a job. */
export async function attachIntake(ctx: Ctx, intakeId: string, jobFileId: string) {
  const [intake] = await ctx.repo.select<IntakeItem>('ophanim_intake_items', org(ctx), { id: intakeId });
  const [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org(ctx), { id: jobFileId });
  if (!intake || !job) throw new JobFileInputError('Intake item or job file not found.');
  await ctx.repo.update('ophanim_intake_items', org(ctx), { id: intakeId }, { status: 'matched', matchedJobFileId: jobFileId });
  await ctx.repo.update('ophanim_documents', org(ctx), { intakeItemId: intakeId }, { jobFileId });
  await adoptReferences(ctx, jobFileId, findReferences([intake.subject, intake.bodyText].filter(Boolean).join('\n')), intake.channel);
  await audit(ctx, 'intake.attached', 'job_file', jobFileId, { intakeId });
  return job;
}
export async function createJobFromIntake(ctx: Ctx, intakeId: string, input: JobInput) {
  const job = await createJobFile(ctx, { ...input, createdFrom: 'email' });
  await attachIntake(ctx, intakeId, job.id);
  await ctx.repo.update('ophanim_intake_items', org(ctx), { id: intakeId }, { status: 'created_job' });
  return job;
}
