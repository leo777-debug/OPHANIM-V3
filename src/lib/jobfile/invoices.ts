// Invoice Desk: draft client invoices from the job file, check them before sending,
// match incoming carrier/terminal invoices to jobs (margin, delay costs), export
// PINT AE through an e-invoice adapter (stub by default), and predict payment date
// and dispute odds into the ledger. Ophanim is not an e-invoicing provider.
import { makeFlag, normalizeParty, type Flag } from './checks';
import { findReferences } from './identifiers';
import { ensureJobShipment, recordPrediction, resolveQuestion } from './ledger';
import { matchReferences } from './matching';
import { jobFacts } from './papers';
import { audit, JobFileInputError, keyRing, loadJob, saveFlags, userOf } from './service';
import type { Ctx, Invoice, JobFile } from './types';

export type InvoiceLineInput = { code?: string; description: string; quantity: number; unitPrice: number; vatRate?: number; evidenceDocumentId?: string | null };
const round2 = (value: number) => Math.round(value * 100) / 100;
const DELAY_KINDS: Array<[RegExp, 'storage' | 'demurrage' | 'detention']> = [[/\bstorage\b/i, 'storage'], [/\bdemurrage\b/i, 'demurrage'], [/\bdetention\b/i, 'detention']];
export const delayKindOf = (text: string) => DELAY_KINDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
/** Standard charges need no evidence; anything else should carry a document. */
const STANDARD = new Set(['freight', 'handling', 'documentation', 'customs', 'delivery', 'pass_through']);

export function totals(lines: InvoiceLineInput[]) {
  const rows = lines.map(line => { const amount = round2(line.quantity * line.unitPrice); return { ...line, amount, vat: round2(amount * (line.vatRate ?? 0.05)) }; });
  const subtotal = round2(rows.reduce((sum, row) => sum + row.amount, 0)), vatAmount = round2(rows.reduce((sum, row) => sum + row.vat, 0));
  return { rows, subtotal, vatAmount, total: round2(subtotal + vatAmount) };
}

/**
 * Draft an outgoing invoice. Freight is charged on the job's checked chargeable weight.
 * VAT default: international freight zero-rated, local charges 5% — confirm with your tax adviser.
 */
export async function draftInvoice(ctx: Ctx, jobFileId: string, input: { ratePerKg?: number; lines?: InvoiceLineInput[]; quoteTotal?: number | null; currency?: string; dueDays?: number; billTo?: string } = {}) {
  const aggregate = await loadJob(ctx, jobFileId);
  if (!aggregate) throw new JobFileInputError('Job file not found.');
  const { job } = aggregate, facts = jobFacts(aggregate, ctx.now?.() ?? Date.now()), chargeable = Number(facts.chargeable_weight_kg ?? 0);
  const lines: InvoiceLineInput[] = [...(input.lines ?? [])];
  if (input.ratePerKg && chargeable) lines.unshift({ code: 'freight', description: `Air/sea freight ${job.origin ?? ''}–${job.destination ?? ''}, chargeable ${chargeable} kg`.trim(), quantity: chargeable, unitPrice: input.ratePerKg, vatRate: 0 });
  // Pass-through costs billed to us (carrier, terminal, storage) become lines with their evidence.
  for (const incoming of aggregate.invoices.filter(item => item.direction === 'incoming')) for (const line of incoming.lines)
    lines.push({ code: delayKindOf(line.description) ?? 'pass_through', description: `${line.description} (${incoming.counterpartyName ?? 'supplier'} ${incoming.invoiceNumber ?? ''})`.trim(), quantity: line.quantity, unitPrice: line.unitPrice, vatRate: 0.05, evidenceDocumentId: (line as { evidenceDocumentId?: string }).evidenceDocumentId ?? `invoice:${incoming.id}` });
  if (!lines.length) throw new JobFileInputError('Add a rate per kg or charge lines to draft the invoice.');
  const sum = totals(lines), issuedAt = new Date(ctx.now?.() ?? Date.now());
  const previous = aggregate.invoices.filter(item => item.direction === 'outgoing').length;
  const invoice = await ctx.repo.insert<Invoice>('ophanim_invoices', ctx.actor.organizationId, {
    jobFileId, direction: 'outgoing', counterpartyId: input.billTo ? null : job.clientCounterpartyId, counterpartyName: input.billTo ?? job.clientName, invoiceNumber: `${job.jobNumber}-INV${previous ? `-${previous + 1}` : ''}`,
    lines: sum.rows.map(row => ({ code: row.code, description: row.description, quantity: row.quantity, unitPrice: row.unitPrice, amount: row.amount, vatRate: row.vatRate ?? 0.05, evidenceDocumentId: row.evidenceDocumentId ?? null })),
    subtotal: sum.subtotal, vatAmount: sum.vatAmount, total: sum.total, currency: input.currency ?? 'AED', quoteTotal: input.quoteTotal ?? null, status: 'draft', einvoiceStatus: 'not_submitted',
    issuedAt: issuedAt.toISOString(), dueAt: new Date(issuedAt.getTime() + (input.dueDays ?? 30) * 864e5).toISOString(), createdByUserId: userOf(ctx),
  });
  await audit(ctx, 'invoice.drafted', 'job_file', jobFileId, { invoiceId: invoice.id, total: invoice.total, currency: invoice.currency });
  const flags = await checkInvoice(ctx, job, invoice, chargeable);
  const predictions = await predictInvoice(ctx, job, invoice, flags);
  return { invoice, flags, predictions };
}

/** Pre-send checks: quote, chargeable weight, storage not passed on, wrong client, VAT arithmetic. */
export function invoiceChecks(job: Pick<JobFile, 'id' | 'clientName'>, invoice: Invoice, chargeableKg: number, incoming: Invoice[]): Flag[] {
  const flags: Flag[] = [], fp = (code: string) => `${code}:${job.id}:${invoice.id}`;
  if (invoice.quoteTotal && invoice.subtotal > invoice.quoteTotal * 1.1) flags.push(makeFlag('invoice_vs_quote', 'warn', fp('invoice_vs_quote'), { total: invoice.subtotal.toFixed(2), quote: invoice.quoteTotal.toFixed(2), pct: Math.round((invoice.subtotal / invoice.quoteTotal - 1) * 100) }));
  const freight = invoice.lines.find(line => (line as { code?: string }).code === 'freight');
  if (freight && chargeableKg && Math.abs(freight.quantity - chargeableKg) > 0.5) flags.push(makeFlag('invoice_chargeable_changed', 'warn', fp('invoice_chargeable_changed'), { invoice: freight.quantity, job: chargeableKg }));
  const storage = incoming.flatMap(item => item.lines).filter(line => delayKindOf(line.description) === 'storage').reduce((sum, line) => sum + line.amount, 0);
  if (storage > 0 && !invoice.lines.some(line => delayKindOf(line.description) === 'storage')) flags.push(makeFlag('invoice_missing_storage', 'warn', fp('invoice_missing_storage'), { amount: storage.toFixed(2) }));
  if (job.clientName && invoice.counterpartyName && normalizeParty(job.clientName) !== normalizeParty(invoice.counterpartyName)) flags.push(makeFlag('invoice_wrong_client', 'block', fp('invoice_wrong_client'), { invoice: invoice.counterpartyName, job: job.clientName }));
  const recomputed = totals(invoice.lines.map(line => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, vatRate: (line as { vatRate?: number }).vatRate })));
  const rates = invoice.lines.map(line => (line as { vatRate?: number }).vatRate ?? 0.05);
  if (Math.abs(recomputed.vatAmount - invoice.vatAmount) > 0.05 || rates.some(rate => rate !== 0 && rate !== 0.05)) flags.push(makeFlag('vat_sensible', 'warn', fp('invoice_vat'), { vat: invoice.vatAmount.toFixed(2), subtotal: invoice.subtotal.toFixed(2), rate: invoice.subtotal ? round2(invoice.vatAmount / invoice.subtotal * 100) : 0 }));
  return flags;
}
async function checkInvoice(ctx: Ctx, job: JobFile, invoice: Invoice, chargeable: number) {
  const incoming = await ctx.repo.select<Invoice>('ophanim_invoices', ctx.actor.organizationId, { jobFileId: job.id, direction: 'incoming' });
  const flags = invoiceChecks(job, invoice, chargeable, incoming);
  await saveFlags(ctx, job.id, flags, { replaceCodes: [] });
  return flags;
}

// ---- Predictions: payment date range and dispute odds -------------------------------
export const PAYMENT_PRIOR_DAYS = { p10: 21, p50: 40, p90: 75 };
export function paymentRange(history: number[], orgHistory: number[]) {
  const source = history.length >= 5 ? { days: history, basis: 'client history' } : orgHistory.length >= 5 ? { days: orgHistory, basis: 'organization prior' } : null;
  if (!source) return { ...PAYMENT_PRIOR_DAYS, basis: 'default prior (no history yet)', n: 0 };
  const sorted = [...source.days].sort((a, b) => a - b), q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), basis: source.basis, n: sorted.length };
}
/** Rules first: above quote, re-weighed cargo, extra charges without evidence. */
export function disputeOdds(invoice: Invoice, flags: Flag[]) {
  const reasons: Array<{ label: string; weight: number }> = [];
  if (flags.some(flag => flag.code === 'invoice_vs_quote')) reasons.push({ label: 'more than 10% above the quote', weight: 1.6 });
  if (flags.some(flag => flag.code === 'invoice_chargeable_changed')) reasons.push({ label: 're-weighed cargo / chargeable weight changed', weight: 1.0 });
  const unsupported = invoice.lines.filter(line => !STANDARD.has((line as { code?: string }).code ?? '') && !(line as { evidenceDocumentId?: string | null }).evidenceDocumentId);
  if (unsupported.length) reasons.push({ label: `${unsupported.length} extra charge(s) without evidence attached`, weight: 1.1 });
  const logit = -2.9 + reasons.reduce((sum, reason) => sum + reason.weight, 0);
  return { probability: Math.round(1 / (1 + Math.exp(-logit)) * 1000) / 1000, reasons };
}
async function predictInvoice(ctx: Ctx, job: JobFile, invoice: Invoice, flags: Flag[]) {
  const org = ctx.actor.organizationId, paid = (await ctx.repo.select<Invoice>('ophanim_invoices', org, { direction: 'outgoing', status: 'paid' })).filter(item => item.issuedAt && item.paidAt);
  const days = (item: Invoice) => (Date.parse(item.paidAt!) - Date.parse(item.issuedAt!)) / 864e5;
  const client = paid.filter(item => item.counterpartyName && invoice.counterpartyName && normalizeParty(item.counterpartyName) === normalizeParty(invoice.counterpartyName)).map(days);
  const range = paymentRange(client, paid.map(days)), issued = Date.parse(invoice.issuedAt!), at = (value: number) => new Date(issued + value * 864e5).toISOString();
  const payment = await recordPrediction(ctx, { questionType: 'payment_date', outcomeKind: 'interval', subjectKey: `payment:${invoice.id}`, jobFileId: job.id, resolveBy: at(range.p90 + 60),
    textEn: `${invoice.invoiceNumber} (${job.jobNumber}) will be paid between ${at(range.p10).slice(0, 10)} and ${at(range.p90).slice(0, 10)}`, p10At: at(range.p10), p50At: at(range.p50), p90At: at(range.p90),
    prediction: { p10: range.p10, p50: range.p50, p90: range.p90, unit: 'days', basis: range.basis, n: range.n }, modelVersion: 'payment-date@1', inputs: { client: invoice.counterpartyName, range, issuedAt: invoice.issuedAt, total: invoice.total }, drivers: [{ label: range.basis, value: range.n }], trigger: 'invoice_drafted' });
  const odds = disputeOdds(invoice, flags);
  const dispute = await recordPrediction(ctx, { questionType: 'dispute_odds', outcomeKind: 'binary', subjectKey: `dispute:${invoice.id}`, jobFileId: job.id, resolveBy: at(range.p90 + 60),
    textEn: `${invoice.invoiceNumber} (${job.jobNumber}) will be disputed or queried by the client`, probability: odds.probability, modelVersion: 'dispute-rules@1', inputs: { flags: flags.map(flag => flag.code), lines: invoice.lines.length, total: invoice.total, quote: invoice.quoteTotal }, rulesFired: odds.reasons, drivers: odds.reasons, trigger: 'invoice_drafted' });
  return { paymentDate: { p10At: at(range.p10), p50At: at(range.p50), p90At: at(range.p90), basis: range.basis, forecastId: payment.forecast.id }, dispute: { ...odds, forecastId: dispute.forecast.id } };
}

/** Paid or disputed: the outcome resolves both invoice predictions. */
export async function markInvoice(ctx: Ctx, invoiceId: string, status: 'approved' | 'sent' | 'paid' | 'disputed', at?: string) {
  const org = ctx.actor.organizationId, [invoice] = await ctx.repo.select<Invoice>('ophanim_invoices', org, { id: invoiceId });
  if (!invoice) throw new JobFileInputError('Invoice not found.');
  const when = at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : new Date(ctx.now?.() ?? Date.now()).toISOString();
  await ctx.repo.update('ophanim_invoices', org, { id: invoiceId }, { status, ...(status === 'paid' ? { paidAt: when } : status === 'disputed' ? { disputedAt: when } : {}) });
  if (status === 'paid') { await resolveQuestion(ctx, `payment:${invoiceId}`, { at: when, source: 'invoice_paid' }, invoice.jobFileId ?? undefined); await resolveQuestion(ctx, `dispute:${invoiceId}`, { bool: Boolean(invoice.disputedAt), source: 'invoice_paid' }, invoice.jobFileId ?? undefined); }
  if (status === 'disputed') await resolveQuestion(ctx, `dispute:${invoiceId}`, { bool: true, source: 'query_received' }, invoice.jobFileId ?? undefined);
  await audit(ctx, `invoice.${status}`, 'job_file', invoice.jobFileId, { invoiceId });
}

/** Incoming carrier/terminal invoices are matched to jobs by their references; delay charges are tagged as the job's actual cost of delay. */
export async function recordIncomingInvoice(ctx: Ctx, input: { counterpartyName: string; invoiceNumber?: string; referencesText: string; lines: InvoiceLineInput[]; currency?: string; issuedAt?: string; jobFileId?: string }) {
  const decision = input.jobFileId ? { jobFileId: input.jobFileId, status: 'matched' as const } : matchReferences(findReferences(`${input.referencesText} ${input.invoiceNumber ?? ''}`), await keyRing(ctx));
  const sum = totals(input.lines), kinds = input.lines.map(line => delayKindOf(line.description)).filter(Boolean);
  const invoice = await ctx.repo.insert<Invoice>('ophanim_invoices', ctx.actor.organizationId, { jobFileId: decision.jobFileId, direction: 'incoming', counterpartyName: input.counterpartyName.slice(0, 200), invoiceNumber: input.invoiceNumber ?? null,
    lines: sum.rows.map(row => ({ description: row.description, quantity: row.quantity, unitPrice: row.unitPrice, amount: row.amount, vatRate: row.vatRate ?? 0.05 })), subtotal: sum.subtotal, vatAmount: sum.vatAmount, total: sum.total,
    currency: input.currency ?? 'AED', delayCostKind: kinds[0] ?? null, status: 'approved', einvoiceStatus: 'not_submitted', issuedAt: input.issuedAt ?? new Date(ctx.now?.() ?? Date.now()).toISOString() });
  if (decision.jobFileId && kinds.length) {
    const delay = round2(sum.rows.filter(row => delayKindOf(row.description)).reduce((total, row) => total + row.amount, 0));
    // The actual cost of delay, stored as a timestamped fact on the job's shipment for later delay-cost models.
    const shipmentId = await ensureJobShipment(ctx, decision.jobFileId);
    await ctx.repo.insert('ophanim_shipment_events', ctx.actor.organizationId, { shipmentId, eventType: 'delay_cost', occurredAt: invoice.issuedAt, source: `invoice:${input.counterpartyName.slice(0, 80)}`,
      provenance: { invoiceId: invoice.id, kinds, amount: delay, currency: invoice.currency, label: 'actual_cost_of_delay' } });
  }
  await audit(ctx, 'invoice.incoming', 'job_file', decision.jobFileId, { invoiceId: invoice.id, matched: decision.status, delayCostKind: invoice.delayCostKind });
  return { invoice, matched: decision.status === 'matched' };
}

export function margin(invoices: Invoice[]) {
  const outgoing = invoices.filter(item => item.direction === 'outgoing' && item.status !== 'void'), incoming = invoices.filter(item => item.direction === 'incoming');
  if (!outgoing.length && !incoming.length) return null;
  return { revenue: round2(outgoing.reduce((sum, item) => sum + item.subtotal, 0)), cost: round2(incoming.reduce((sum, item) => sum + item.subtotal, 0)), currency: outgoing[0]?.currency ?? incoming[0]?.currency ?? 'AED' };
}
