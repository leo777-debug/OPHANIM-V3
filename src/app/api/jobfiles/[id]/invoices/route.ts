import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { draftInvoice, markInvoice, recordIncomingInvoice, type InvoiceLineInput } from '@/lib/jobfile/invoices';
import { JobFileInputError } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

const lines = (value: unknown): InvoiceLineInput[] => (Array.isArray(value) ? value : []).slice(0, 100).map(item => {
  const line = item as Record<string, unknown>;
  if (typeof line.description !== 'string' || !Number.isFinite(Number(line.quantity)) || !Number.isFinite(Number(line.unitPrice))) throw new JobFileInputError('Each line needs a description, quantity and unit price.');
  return { code: typeof line.code === 'string' ? line.code : undefined, description: line.description.slice(0, 200), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), vatRate: line.vatRate === undefined ? undefined : Number(line.vatRate), evidenceDocumentId: typeof line.evidenceDocumentId === 'string' ? line.evidenceDocumentId : null };
});

/** draft (outgoing from the job file) · incoming (carrier/terminal invoice) · mark (approved/sent/paid/disputed). */
export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const id = (await params).id, body = await boundedJson(request, 64000).catch(() => null) as Record<string, unknown> | null;
  if (body?.action === 'draft') return draftInvoice(ctx, id, { ratePerKg: body.ratePerKg === undefined ? (ctx.actor.demo ? 4.5 : undefined) : Number(body.ratePerKg), lines: lines(body.lines), quoteTotal: body.quoteTotal === undefined ? null : Number(body.quoteTotal), currency: typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : undefined, billTo: typeof body.billTo === 'string' ? body.billTo.slice(0, 200) : undefined });
  if (body?.action === 'incoming' && typeof body.counterpartyName === 'string') return recordIncomingInvoice(ctx, { counterpartyName: body.counterpartyName, invoiceNumber: typeof body.invoiceNumber === 'string' ? body.invoiceNumber : undefined, referencesText: String(body.referencesText ?? ''), lines: lines(body.lines), jobFileId: id });
  if (body?.action === 'mark' && typeof body.invoiceId === 'string' && ['approved', 'sent', 'paid', 'disputed'].includes(String(body.status))) { await markInvoice(ctx, body.invoiceId, body.status as 'paid', typeof body.at === 'string' ? body.at : undefined); return { ok: true }; }
  throw new JobFileInputError('Use action draft, incoming or mark.');
});
