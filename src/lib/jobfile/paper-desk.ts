// Paper Desk: read documents, verify fields against their crop, run the checks,
// prevent mistakes (pre-fill, senior review, Tired-Hands) and teach from fixes.
import { both, t } from '@/lib/i18n';
import { DEFAULT_RULE_PACKS, differenceKey, normalizeParty, number, runChecks, type CheckDocument, type RulePack } from './checks';
import { documentTypes, type DocumentTypeDefinition } from './document-types';
import { validateAwb, validateContainer, type ReferenceType } from './identifiers';
import { readDocument, type ReadResult } from './reader';
import { addReference, attachIntake, audit, createJobFromIntake, JobFileInputError, loadJob, receiveIntake, saveFlags, userOf, type IntakeHooks, type IntakeInput, type JobInput } from './service';
import { getFile } from './storage';
import { closeTodayItem, upsertTodayItem } from './today';
import type { Ctx, ExtractedField, FlagRecord, JobDocument, JobFile } from './types';

export const AUTO_ACCEPT_CONFIDENCE = Number(process.env.JOBFILE_AUTO_ACCEPT_CONFIDENCE || 0.92);
export const HIGH_VALUE_AED = Number(process.env.JOBFILE_HIGH_VALUE_AED || 200000);
/** Codes produced by document checks; re-running checks closes those that no longer fire. */
export const DOCUMENT_CHECK_CODES = ['pieces_mismatch', 'weight_mismatch', 'shipper_mismatch', 'consignee_mismatch', 'hs_code_plausibility', 'invoice_lines_total', 'currency_inconsistent', 'vat_sensible', 'chargeable_weight', 'dates_order', 'date_impossible', 'incoterm_invalid', 'volume_dimensions', 'missing_document'];
const FIELD_REFERENCES: Partial<Record<string, ReferenceType>> = { awb_number: 'awb', hawb_number: 'hawb', bl_number: 'bl', container_number: 'container', invoice_number: 'invoice', delivery_order_number: 'delivery_order' };
const org = (ctx: Ctx) => ctx.actor.organizationId;
const now = (ctx: Ctx) => ctx.now?.() ?? Date.now();

/** Deterministic checks a single value must pass before it can be auto-accepted. */
export function fieldPassesChecks(field: string, value: string, at = Date.now()) {
  if (field === 'awb_number') return validateAwb(value).valid;
  if (field === 'container_number') return validateContainer(value).valid;
  if (['pieces', 'gross_weight_kg', 'chargeable_weight_kg', 'volume_cbm', 'invoice_subtotal', 'vat_amount', 'invoice_total'].includes(field)) { const parsed = number(value); return parsed !== null && parsed >= 0 && (field !== 'pieces' || Number.isInteger(parsed)); }
  if (field.endsWith('_date')) { const parsed = Date.parse(value); return Number.isFinite(parsed) && Math.abs(parsed - at) < 366 * 864e5; }
  if (field === 'currency') return /^[A-Z]{3}$/.test(value.trim());
  return value.trim().length > 0;
}

async function organizationTypes(ctx: Ctx) {
  const rows = await ctx.repo.select<DocumentTypeDefinition & { active: boolean }>('ophanim_document_types', org(ctx), {}, { shared: true });
  return documentTypes(rows);
}

/** Read a stored document and save its fields. Reading never blocks filing: with no reader, fields are typed by hand. */
export async function processDocument(ctx: Ctx, documentId: string, supplied?: ReadResult) {
  const [document] = await ctx.repo.select<JobDocument>('ophanim_documents', org(ctx), { id: documentId });
  if (!document) throw new JobFileInputError('Document not found.');
  const types = await organizationTypes(ctx);
  const result = supplied ?? await readDocument({ bytes: await getFile(document.storagePath, ctx.actor.demo), mimeType: document.mimeType, text: document.textContent, types });
  const docType = result.docType !== 'other' ? result.docType : document.docTypeCode ?? 'other';
  await ctx.repo.update('ophanim_documents', org(ctx), { id: documentId }, { docTypeCode: docType, reader: result.reader, pages: result.pages, classificationConfidence: result.typeConfidence, textContent: (result.text || document.textContent || '').slice(0, 200000) });
  await ctx.repo.remove('ophanim_extracted_fields', org(ctx), { documentId, status: 'suggested' });
  const kept = new Set((await ctx.repo.select<ExtractedField>('ophanim_extracted_fields', org(ctx), { documentId })).map(field => field.field));
  for (const field of result.fields) {
    if (kept.has(field.field)) continue;
    const auto = result.reader !== 'tesseract' && field.confidence >= AUTO_ACCEPT_CONFIDENCE && fieldPassesChecks(field.field, field.value, now(ctx));
    await ctx.repo.insert('ophanim_extracted_fields', org(ctx), { documentId, jobFileId: document.jobFileId, field: field.field, value: field.value, normalizedValue: field.value.trim().toUpperCase(), confidence: field.confidence, page: field.page, bbox: field.bbox, reader: result.reader, status: auto ? 'auto_accepted' : 'suggested' });
  }
  if (result.lines.length && !kept.has('invoice_lines')) await ctx.repo.insert('ophanim_extracted_fields', org(ctx), { documentId, jobFileId: document.jobFileId, field: 'invoice_lines', value: JSON.stringify(result.lines), normalizedValue: null, confidence: 0.8, page: 1, bbox: null, reader: result.reader, status: 'suggested' });
  if (document.jobFileId) {
    for (const field of result.fields) { const type = FIELD_REFERENCES[field.field]; if (type) await addReference(ctx, document.jobFileId, type, field.value, 'document'); }
    await runJobChecks(ctx, document.jobFileId);
    await upsertTodayItem(ctx, { kind: 'confirm_document', jobFileId: document.jobFileId, sourceKey: `confirm:${documentId}`, titleEn: `Confirm fields on ${docType.replace(/_/g, ' ')}`, titleAr: `تأكيد حقول المستند`, probability: 1, cost: 20, payload: { documentId } });
  }
  await audit(ctx, 'document.read', 'job_file', document.jobFileId, { documentId, reader: result.reader, fields: result.fields.length, docType });
  return { reader: result.reader, docType, fields: result.fields.length, note: result.note ?? null, text: result.text };
}

/** Intake with reading and checks wired in. */
export function paperHooks(ctx: Ctx): IntakeHooks {
  return {
    read: async documentId => (await processDocument(ctx, documentId)).text,
    afterAttach: async (jobFileId, documentIds) => {
      for (const documentId of documentIds) for (const field of await ctx.repo.select<ExtractedField>('ophanim_extracted_fields', org(ctx), { documentId })) {
        const type = FIELD_REFERENCES[field.field]; if (type && field.value) await addReference(ctx, jobFileId, type, field.value, 'document');
      }
      await runJobChecks(ctx, jobFileId);
      for (const documentId of documentIds) if ((await ctx.repo.select('ophanim_extracted_fields', org(ctx), { documentId, status: 'suggested' })).length)
        await upsertTodayItem(ctx, { kind: 'confirm_document', jobFileId, sourceKey: `confirm:${documentId}`, titleEn: 'Confirm fields on a new document', titleAr: 'تأكيد حقول مستند جديد', probability: 1, cost: 20, payload: { documentId } });
    },
  };
}
export async function receiveAndProcess(ctx: Ctx, input: IntakeInput, options: { autoCreateFromPreAlert?: boolean } = {}) {
  // Scheduled imports: a sheet emailed by a sender whose mapping we already remember is synced, not filed as a document.
  const domain = input.sender?.match(/@([a-z0-9.-]+)/i)?.[1]?.toLowerCase();
  const sheets = input.attachments.filter(item => /\.(csv|xlsx)$/i.test(item.fileName));
  if (sheets.length && domain && input.channel === 'email') {
    const { importTrackingSheet } = await import('./sync');
    const [profile] = await ctx.repo.select('ophanim_import_mapping_profiles', org(ctx), { name: `jobfile-sync:email:${domain}` });
    if (profile) for (const sheet of sheets) await importTrackingSheet(ctx, { sourceKey: `email:${domain}`, fileName: sheet.fileName, mimeType: sheet.mimeType, bytes: sheet.bytes });
    if (profile) input = { ...input, attachments: input.attachments.filter(item => !sheets.includes(item)) };
  }
  const result = await receiveIntake(ctx, input, { ...options, ...paperHooks(ctx) });
  if (result.intake.status === 'review') await upsertTodayItem(ctx, { kind: 'intake_review', sourceKey: `intake:${result.intake.id}`, titleEn: `Review ${input.channel} item: ${result.decision.reason.replace('_', ' ')}`, titleAr: 'مراجعة عنصر وارد', probability: 1, cost: 150, payload: { intakeId: result.intake.id } });
  // Milestone times written in emails and messages (rules first, optional AI second).
  if (result.intake.matchedJobFileId && (input.channel === 'email' || input.channel === 'whatsapp')) {
    const { applyEmailMilestones } = await import('./milestones');
    const from = domain ?? input.sender ?? null;
    await applyEmailMilestones(ctx, result.intake.matchedJobFileId, [input.subject, input.bodyText].filter(Boolean).join('\n'), from ? `${input.channel}:${from}` : null);
  }
  return result;
}
export async function attachAndProcess(ctx: Ctx, intakeId: string, jobFileId: string) {
  const job = await attachIntake(ctx, intakeId, jobFileId, paperHooks(ctx)); await closeTodayItem(ctx, `intake:${intakeId}`); return job;
}
export async function createFromIntakeAndProcess(ctx: Ctx, intakeId: string, input: JobInput) {
  const job = await createJobFromIntake(ctx, intakeId, input, paperHooks(ctx)); await closeTodayItem(ctx, `intake:${intakeId}`); return job;
}

const linesOf = (document: JobDocument & { fields?: ExtractedField[] }) => { const field = document.fields?.find(item => item.field === 'invoice_lines' && item.status !== 'rejected'); try { return field?.value ? JSON.parse(field.value) : undefined; } catch { return undefined; } };
/** The values checks use: confirmed/corrected first, then auto-accepted, then suggestions. Rejected values never count. */
export function checkDocuments(documents: Array<JobDocument & { fields?: ExtractedField[] }>): CheckDocument[] {
  const rank = { corrected: 0, confirmed: 0, auto_accepted: 1, suggested: 2, rejected: 9 } as const;
  return documents.filter(document => document.docTypeCode && document.docTypeCode !== 'other').map(document => {
    const fields: CheckDocument['fields'] = {};
    for (const field of [...(document.fields ?? [])].sort((a, b) => rank[a.status] - rank[b.status])) {
      if (field.status === 'rejected' || field.field === 'invoice_lines' || fields[field.field] || field.value === null) continue;
      fields[field.field] = { value: field.value, confidence: Number(field.confidence), page: field.page, bbox: field.bbox ?? undefined };
    }
    return { id: document.id, type: document.docTypeCode!, fields, lines: linesOf(document) };
  });
}

export const clientKeyOf = (job: Pick<JobFile, 'clientCounterpartyId' | 'clientName'>) => job.clientCounterpartyId ?? (job.clientName ? normalizeParty(job.clientName) : 'unknown-client');

/** Run every document check for a job, save flags, downgrade auto-accepted fields that a flag touches, and route risky files. */
export async function runJobChecks(ctx: Ctx, jobFileId: string) {
  const aggregate = await loadJob(ctx, jobFileId);
  if (!aggregate) return [];
  const { job } = aggregate, clientKey = clientKeyOf(job);
  const accepted = await ctx.repo.select<{ counterpartyKey: string; checkCode: string; valueA: string; valueB: string }>('ophanim_accepted_differences', org(ctx), { counterpartyKey: clientKey });
  const packs = await ctx.repo.select<RulePack & { active: boolean }>('ophanim_rule_packs', org(ctx), { active: true }, { shared: true });
  const departure = job.plannedDepartureAt ? Date.parse(job.plannedDepartureAt) : null;
  const flags = runChecks({
    jobId: job.id, mode: job.mode, origin: job.origin, destination: job.destination, goods: job.goodsDescription, clientKey, documents: checkDocuments(aggregate.documents), now: now(ctx),
    rulePacks: packs.length ? packs.map(pack => ({ ...pack, requiredDocuments: (pack as unknown as { requiredDocuments: string[] }).requiredDocuments })) : DEFAULT_RULE_PACKS,
    acceptedDifferences: new Set(accepted.map(item => differenceKey(item.counterpartyKey, item.checkCode, item.valueA, item.valueB))),
    departureSoon: departure !== null && departure - now(ctx) < 24 * 3600e3 && departure > now(ctx),
  });
  const raised = await saveFlags(ctx, jobFileId, flags, { replaceCodes: DOCUMENT_CHECK_CODES });
  const touched = new Set(flags.flatMap(flag => flag.fields.map(field => `${field.documentId}:${field.field}`)));
  for (const document of aggregate.documents) for (const field of document.fields ?? []) {
    if (field.status === 'auto_accepted' && touched.has(`${document.id}:${field.field}`)) await ctx.repo.update('ophanim_extracted_fields', org(ctx), { id: field.id }, { status: 'suggested' });
  }
  for (const flag of raised) await upsertTodayItem(ctx, { kind: 'flag', jobFileId, sourceKey: `flag:${flag.id}`, titleEn: `${job.jobNumber}: ${flag.messageEn}`, titleAr: `${job.jobNumber}: ${flag.messageAr}`, probability: flag.severity === 'block' ? 0.9 : flag.severity === 'warn' ? 0.5 : 0.15, cost: flag.severity === 'block' ? 2000 : 500, payload: { flagId: flag.id, severity: flag.severity } });
  await routeForSeniorReview(ctx, job, (await ctx.repo.select<FlagRecord>('ophanim_job_checks', org(ctx), { jobFileId, status: 'open' })));
  return flags;
}

// ---- Prevent mistakes: senior review and Tired-Hands -------------------------------
type StaffEvent = { userId: string; documentType: string; processStep: string; checkCode: string | null; isError: boolean; createdAt: string };
export function tiredHands(events: StaffEvent[], at: number, timeZone = 'Asia/Dubai') {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(at));
  const lastHour = events.filter(event => at - Date.parse(event.createdAt) <= 3600e3 && at >= Date.parse(event.createdAt)).length;
  const reasons: string[] = [];
  if (hour >= 21 || hour < 6) reasons.push('late in the shift');
  if (lastHour >= 15) reasons.push(`${lastHour} files in the last hour`);
  return reasons;
}
export async function routeForSeniorReview(ctx: Ctx, job: JobFile, openFlags: FlagRecord[]) {
  const reasons: string[] = [], user = userOf(ctx);
  if (openFlags.some(flag => flag.severity === 'block')) reasons.push('block flag');
  if ((job.declaredValue ?? 0) >= HIGH_VALUE_AED) reasons.push('high-value job');
  if (user) {
    const events = await ctx.repo.select<StaffEvent>('ophanim_staff_error_events', org(ctx), { userId: user }, { order: 'createdAt desc', limit: 200 });
    if (events.length < 20) reasons.push('new staff member');
    reasons.push(...tiredHands(events, now(ctx)));
  }
  const changes = (await ctx.repo.select<{ action: string; metadata: Record<string, unknown>; createdAt: string }>('ophanim_audit_events', org(ctx), { subjectId: job.id, action: 'field.corrected' }))
    .filter(entry => ['consignee', 'gross_weight_kg'].includes(String(entry.metadata.field)));
  const deadline = Date.parse(job.plannedDepartureAt ?? job.plannedArrivalAt ?? '');
  if (Number.isFinite(deadline) && changes.some(entry => deadline - Date.parse(entry.createdAt) < 24 * 3600e3)) reasons.push('last-minute change to consignee or weight');
  if (!reasons.length || (reasons.length === 1 && reasons[0] === 'new staff member' && !openFlags.length)) return null;
  const reason = reasons.join(', ');
  return upsertTodayItem(ctx, { kind: 'review_request', jobFileId: job.id, sourceKey: `senior:${job.id}`, team: 'senior', titleEn: `${job.jobNumber}: ${t('en', 'desk.senior', { reason })}`, titleAr: `${job.jobNumber}: ${t('ar', 'desk.senior', { reason })}`, probability: 0.6, cost: 1000, payload: { reasons } });
}

// ---- Verification: confirm / correct --------------------------------------------
export async function confirmField(ctx: Ctx, fieldId: string, action: 'confirm' | 'correct' | 'reject', value?: string) {
  const [field] = await ctx.repo.select<ExtractedField>('ophanim_extracted_fields', org(ctx), { id: fieldId });
  if (!field) throw new JobFileInputError('Field not found.');
  const corrected = action === 'correct' && typeof value === 'string' && value.trim() !== (field.value ?? '');
  const status = action === 'reject' ? 'rejected' : corrected ? 'corrected' : 'confirmed';
  await ctx.repo.update('ophanim_extracted_fields', org(ctx), { id: fieldId }, { status, ...(corrected ? { value: value!.trim().slice(0, 200), normalizedValue: value!.trim().toUpperCase() } : {}), confirmedByUserId: userOf(ctx), confirmedAt: new Date(now(ctx)).toISOString() });
  await audit(ctx, corrected ? 'field.corrected' : `field.${status}`, 'job_file', field.jobFileId, { field: field.field, documentId: field.documentId, from: field.value, to: corrected ? value : field.value });
  const remaining = (await ctx.repo.select<ExtractedField>('ophanim_extracted_fields', org(ctx), { documentId: field.documentId, status: 'suggested' })).length;
  if (!remaining) {
    await closeTodayItem(ctx, `confirm:${field.documentId}`);
    const [document] = await ctx.repo.select<JobDocument>('ophanim_documents', org(ctx), { id: field.documentId });
    const user = userOf(ctx);
    if (user) await ctx.repo.insert('ophanim_staff_error_events', org(ctx), { userId: user, documentType: document?.docTypeCode ?? 'other', processStep: 'verify', checkCode: null, isError: false });
  }
  if (field.jobFileId) await runJobChecks(ctx, field.jobFileId);
  return { status };
}

// ---- Fixing flags, remembered differences and lessons ----------------------------
export async function lessonFor(ctx: Ctx, flag: Pick<FlagRecord, 'checkCode' | 'messageEn' | 'messageAr'>) {
  const [custom] = await ctx.repo.select<{ lessonEn: string; lessonAr: string; exampleEn: string; exampleAr: string }>('ophanim_lessons', org(ctx), { checkCode: flag.checkCode }, { shared: true });
  const fallback = both(`lesson.${flag.checkCode}`), generic = fallback.en === `lesson.${flag.checkCode}`;
  return { checkCode: flag.checkCode, lessonEn: custom?.lessonEn ?? (generic ? 'Compare this value on every document before sending.' : fallback.en), lessonAr: custom?.lessonAr ?? (generic ? 'قارن هذه القيمة في كل المستندات قبل الإرسال.' : fallback.ar),
    // The example is this job's own (anonymised) flag message: no client names in lessons.
    exampleEn: custom?.exampleEn || flag.messageEn.replace(/"[^"]*"/g, '"…"'), exampleAr: custom?.exampleAr || flag.messageAr.replace(/"[^"]*"/g, '"…"') };
}
export async function resolveFlag(ctx: Ctx, jobFileId: string, flagId: string, status: 'fixed' | 'accepted_difference' | 'false_alarm') {
  const [flag] = await ctx.repo.select<FlagRecord>('ophanim_job_checks', org(ctx), { id: flagId, jobFileId });
  const [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org(ctx), { id: jobFileId });
  if (!flag || !job) throw new JobFileInputError('Flag not found.');
  if (flag.severity === 'block' && status !== 'fixed' && !['owner', 'operations_manager'].includes(ctx.actor.role) && !ctx.actor.demo) throw new JobFileInputError('A senior must accept or dismiss a block flag.');
  await ctx.repo.update('ophanim_job_checks', org(ctx), { id: flagId }, { status, resolvedByUserId: userOf(ctx), resolvedAt: new Date(now(ctx)).toISOString() });
  if (status === 'accepted_difference') {
    const params = flag.details.params ?? {}, a = String(params.a ?? ''), b = String(params.b ?? '');
    const [valueA, valueB] = flag.checkCode.endsWith('_mismatch') && ['shipper_mismatch', 'consignee_mismatch'].includes(flag.checkCode) ? [normalizeParty(a), normalizeParty(b)].sort() : [a, b].sort();
    await ctx.repo.insert('ophanim_accepted_differences', org(ctx), { counterpartyKey: clientKeyOf(job), checkCode: flag.checkCode, valueA, valueB, acceptedByUserId: userOf(ctx) });
  }
  await closeTodayItem(ctx, `flag:${flagId}`);
  await audit(ctx, `flag.${status}`, 'job_file', jobFileId, { flagId, code: flag.checkCode });
  if (status === 'fixed') {
    const responsible = flag.raisedForUserId;
    if (responsible) await ctx.repo.insert('ophanim_staff_error_events', org(ctx), { userId: responsible, documentType: flag.documentIds.length ? (await ctx.repo.select<JobDocument>('ophanim_documents', org(ctx), { id: flag.documentIds[0] }))[0]?.docTypeCode ?? 'other' : 'job', processStep: 'paperwork', checkCode: flag.checkCode, isError: true });
    return { lesson: await lessonFor(ctx, flag) };
  }
  return {};
}

// ---- Personal streak (private) and team totals (no ranking) ----------------------
export async function myStats(ctx: Ctx) {
  const user = userOf(ctx) ?? (ctx.actor.demo ? ctx.actor.userId : null);
  if (!user) return { documents: 0, errors: 0, streak: 0 };
  const events = await ctx.repo.select<StaffEvent>('ophanim_staff_error_events', org(ctx), { userId: user }, { order: 'createdAt desc', limit: 2000 });
  const streak = events.findIndex(event => event.isError);
  return { documents: events.filter(event => !event.isError).length, errors: events.filter(event => event.isError).length, streak: streak < 0 ? events.filter(event => !event.isError).length : events.slice(0, streak).filter(event => !event.isError).length, clean: streak < 0 };
}
/** Team totals by document type and step only. Never per person. */
export async function teamStats(ctx: Ctx) {
  const events = await ctx.repo.select<StaffEvent>('ophanim_staff_error_events', org(ctx), {}, { limit: 5000 });
  const groups = new Map<string, { documentType: string; processStep: string; total: number; errors: number }>();
  for (const event of events) {
    const key = `${event.documentType}|${event.processStep}`, group = groups.get(key) ?? { documentType: event.documentType, processStep: event.processStep, total: 0, errors: 0 };
    group.total++; if (event.isError) group.errors++; groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, errorRate: group.total ? Math.round(group.errors / group.total * 1000) / 10 : 0 })).sort((a, b) => b.errorRate - a.errorRate);
}

// ---- Search and archive -----------------------------------------------------------
export async function searchDocuments(ctx: Ctx, query: string) {
  const needle = query.trim().toUpperCase();
  if (needle.length < 2) return [];
  const [documents, fields, references, jobs] = await Promise.all([
    ctx.repo.select<JobDocument>('ophanim_documents', org(ctx), {}, { order: 'createdAt desc', limit: 5000 }),
    ctx.repo.select<ExtractedField>('ophanim_extracted_fields', org(ctx), {}, { limit: 20000 }),
    ctx.repo.select<{ jobFileId: string; normalizedValue: string }>('ophanim_job_references', org(ctx)),
    ctx.repo.select<JobFile>('ophanim_job_files', org(ctx)),
  ]);
  const jobsByRef = new Set(references.filter(reference => reference.normalizedValue.includes(needle)).map(reference => reference.jobFileId));
  const jobNumbers = new Map(jobs.map(job => [job.id, job]));
  const hits = documents.filter(document => jobsByRef.has(document.jobFileId ?? '') || document.originalFileName.toUpperCase().includes(needle) || (document.textContent ?? '').toUpperCase().includes(needle)
    || fields.some(field => field.documentId === document.id && (field.value ?? '').toUpperCase().includes(needle)) || (jobNumbers.get(document.jobFileId ?? '')?.clientName ?? '').toUpperCase().includes(needle));
  return hits.slice(0, 100).map(document => ({
    id: document.id, jobFileId: document.jobFileId, jobNumber: jobNumbers.get(document.jobFileId ?? '')?.jobNumber ?? null, docTypeCode: document.docTypeCode, fileName: document.originalFileName, receivedAt: document.receivedAt, versionNumber: document.versionNumber,
    versions: versionChain(documents, document),
  }));
}
function versionChain(documents: JobDocument[], document: JobDocument) {
  const chain: Array<{ id: string; versionNumber: number; createdAt: string }> = []; let current: JobDocument | undefined = document;
  for (let guard = 0; current && guard < 50; guard++) { chain.push({ id: current.id, versionNumber: current.versionNumber, createdAt: current.createdAt }); current = documents.find(item => item.id === current!.previousVersionId); }
  return chain;
}
