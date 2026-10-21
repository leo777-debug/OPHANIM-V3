// Draft papers from checked job-file data: house AWB, delivery note, client invoice.
// Nothing is retyped: every value comes from the job file. A person approves before
// a paper is final; every version is kept.
import { can } from '@/lib/operations/authorization';
import { checkDocuments } from './paper-desk';
import { buildPdf, type PdfItem } from './pdf';
import { audit, JobFileInputError, loadJob, userOf, type JobAggregate } from './service';
import { getFile, putFile, signedUrl, storageKey } from './storage';
import type { Ctx, Invoice } from './types';

export const PAPER_KINDS = ['house_awb', 'delivery_note', 'client_invoice'] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];
type Template = { layout: { title?: string; companyName?: string; footer?: string }; logoStoragePath: string | null };
export type Paper = { id: string; jobFileId: string; kind: PaperKind; version: number; data: Record<string, unknown>; storagePath: string | null; status: 'draft' | 'approved'; approvedByUserId: string | null; approvedAt: string | null; createdAt: string };

const FIELDS: Record<PaperKind, Array<[string, string]>> = {
  house_awb: [['hawb_number', 'House AWB'], ['awb_number', 'Master AWB'], ['shipper', 'Shipper'], ['consignee', 'Consignee'], ['notify_party', 'Notify party'], ['origin', 'Airport of departure'], ['destination', 'Airport of destination'],
    ['flight', 'Flight'], ['pieces', 'No. of pieces'], ['gross_weight_kg', 'Gross weight (kg)'], ['chargeable_weight_kg', 'Chargeable weight (kg)'], ['volume_cbm', 'Volume (m3)'], ['description', 'Nature and quantity of goods'], ['hs_code', 'HS code'], ['issue_date', 'Executed on']],
  delivery_note: [['job_number', 'Job file'], ['awb_number', 'AWB'], ['bl_number', 'B/L'], ['container_number', 'Container'], ['consignee', 'Deliver to'], ['destination', 'Destination'], ['pieces', 'Pieces'], ['gross_weight_kg', 'Gross weight (kg)'], ['description', 'Goods'], ['issue_date', 'Date']],
  client_invoice: [['invoice_number', 'Invoice no.'], ['client', 'Bill to'], ['job_number', 'Job file'], ['awb_number', 'AWB / B/L'], ['chargeable_weight_kg', 'Chargeable weight (kg)'], ['currency', 'Currency'], ['subtotal', 'Subtotal'], ['vat_amount', 'VAT'], ['total', 'Total'], ['issue_date', 'Date']],
};
const REQUIRED: Record<PaperKind, string[]> = {
  house_awb: ['hawb_number', 'awb_number', 'shipper', 'consignee', 'origin', 'destination', 'pieces', 'gross_weight_kg', 'chargeable_weight_kg', 'description', 'issue_date'],
  delivery_note: ['job_number', 'consignee', 'pieces', 'issue_date'],
  client_invoice: ['invoice_number', 'client', 'currency', 'total', 'issue_date'],
};

/** The checked facts of a job: confirmed values first, then key ring and header. */
export function jobFacts(aggregate: JobAggregate, now = Date.now()): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const document of checkDocuments(aggregate.documents)) for (const [field, value] of Object.entries(document.fields)) if (value && !facts[field]) facts[field] = value.value;
  for (const reference of aggregate.references.filter(item => item.validated)) {
    const field = { awb: 'awb_number', hawb: 'hawb_number', bl: 'bl_number', container: 'container_number', invoice: 'invoice_number', delivery_order: 'delivery_order_number' }[reference.type as string];
    if (field && !facts[field]) facts[field] = reference.normalizedValue;
  }
  const { job } = aggregate, latest = [...aggregate.pieces].reverse()[0];
  facts.job_number = job.jobNumber; facts.client = job.clientName ?? facts.consignee ?? '';
  facts.origin ||= job.origin ?? ''; facts.destination ||= job.destination ?? ''; facts.description ||= job.goodsDescription ?? '';
  if (latest && !facts.pieces) facts.pieces = String(latest.pieces);
  if (latest?.weightKg && !facts.gross_weight_kg) facts.gross_weight_kg = String(latest.weightKg);
  if (!facts.chargeable_weight_kg && facts.gross_weight_kg) {
    const gross = Number(facts.gross_weight_kg), volume = Number(facts.volume_cbm || 0);
    facts.chargeable_weight_kg = String(Math.round(Math.max(gross, volume * 1e6 / 6000) * 10) / 10);
  }
  facts.hawb_number ||= `${job.jobNumber}-H`;
  facts.issue_date = new Date(now).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== ''));
}

function render(kind: PaperKind, data: Record<string, string>, invoice: Invoice | null, template: Template | null, version: number, hasLogo: boolean): PdfItem[] {
  const title = template?.layout.title ?? { house_awb: 'HOUSE AIR WAYBILL', delivery_note: 'DELIVERY NOTE', client_invoice: 'TAX INVOICE' }[kind];
  const items: PdfItem[] = [
    ...(hasLogo ? [{ kind: 'image' as const, x: 40, y: 30, w: 90, h: 40 }] : []),
    { kind: 'text', x: hasLogo ? 145 : 40, y: 34, size: 16, bold: true, text: title },
    { kind: 'text', x: hasLogo ? 145 : 40, y: 56, size: 9, text: `${template?.layout.companyName ?? 'Issued by your forwarding company'} · DRAFT v${version} · not valid until approved` },
  ];
  let y = 90;
  for (const [field, label] of FIELDS[kind]) {
    const value = data[field] ?? '';
    const lines = value.match(/.{1,70}(\s|$)|\S{70}/g) ?? [''];
    const height = 14 + lines.length * 11;
    items.push({ kind: 'box', x: 40, y, w: 515, h: height }, { kind: 'text', x: 46, y: y + 3, size: 7, bold: true, text: label.toUpperCase() });
    lines.forEach((line, index) => items.push({ kind: 'text', x: 200, y: y + 3 + index * 11, size: 9, text: line.trim() }));
    y += height;
  }
  if (kind === 'client_invoice' && invoice) {
    y += 12; items.push({ kind: 'text', x: 40, y, size: 9, bold: true, text: 'Description' }, { kind: 'text', x: 360, y, size: 9, bold: true, text: 'Qty' }, { kind: 'text', x: 410, y, size: 9, bold: true, text: 'Unit' }, { kind: 'text', x: 480, y, size: 9, bold: true, text: 'Amount' });
    for (const line of invoice.lines) { y += 14; items.push({ kind: 'text', x: 40, y, text: line.description.slice(0, 60) }, { kind: 'text', x: 360, y, text: String(line.quantity) }, { kind: 'text', x: 410, y, text: line.unitPrice.toFixed(2) }, { kind: 'text', x: 480, y, text: line.amount.toFixed(2) }); }
  }
  items.push({ kind: 'text', x: 40, y: 800, size: 7, text: template?.layout.footer ?? 'Prepared from the checked Ophanim job file. Values were not retyped.' });
  return items;
}

export async function draftPaper(ctx: Ctx, jobFileId: string, kind: PaperKind) {
  if (!PAPER_KINDS.includes(kind)) throw new JobFileInputError('Unknown paper type.');
  const aggregate = await loadJob(ctx, jobFileId);
  if (!aggregate) throw new JobFileInputError('Job file not found.');
  const org = ctx.actor.organizationId, data = jobFacts(aggregate, ctx.now?.() ?? Date.now());
  const invoice = kind === 'client_invoice' ? [...aggregate.invoices].reverse().find(item => item.direction === 'outgoing') ?? null : null;
  if (kind === 'client_invoice') {
    if (!invoice) throw new JobFileInputError('Draft the client invoice first (Invoice Desk).');
    Object.assign(data, { invoice_number: invoice.invoiceNumber ?? `${aggregate.job.jobNumber}-INV`, client: invoice.counterpartyName ?? data.client, currency: invoice.currency, subtotal: invoice.subtotal.toFixed(2), vat_amount: invoice.vatAmount.toFixed(2), total: invoice.total.toFixed(2) });
  }
  const missing = REQUIRED[kind].filter(field => !data[field]);
  const [template] = await ctx.repo.select<Template>('ophanim_paper_templates', org, { kind });
  const logo = template?.logoStoragePath ? await getFile(template.logoStoragePath, ctx.actor.demo).catch(() => null) : null;
  const previous = await ctx.repo.select<Paper>('ophanim_generated_papers', org, { jobFileId, kind }, { order: 'version desc', limit: 1 });
  const version = (previous[0]?.version ?? 0) + 1;
  const pdf = buildPdf([render(kind, data, invoice, template ?? null, version, Boolean(logo))], { title: `${kind} ${aggregate.job.jobNumber} v${version}`, logoJpeg: logo });
  const key = storageKey(org, jobFileId, `${kind}-v${version}.pdf`);
  await putFile(key, pdf, 'application/pdf', ctx.actor.demo);
  const paper = await ctx.repo.insert<Paper>('ophanim_generated_papers', org, { jobFileId, kind, version, data: { ...data, missing }, storagePath: key, status: 'draft', createdByUserId: userOf(ctx) });
  await audit(ctx, 'paper.drafted', 'job_file', jobFileId, { paperId: paper.id, kind, version, missing });
  return { paper, missing };
}

export async function approvePaper(ctx: Ctx, jobFileId: string, paperId: string) {
  if (!ctx.actor.demo && !can(ctx.actor, 'jobfile:approve')) throw new JobFileInputError('Only an owner or operations manager can approve a paper.');
  const [paper] = await ctx.repo.select<Paper>('ophanim_generated_papers', ctx.actor.organizationId, { id: paperId, jobFileId });
  if (!paper) throw new JobFileInputError('Paper not found.');
  if (paper.status === 'approved') return { paper };
  const missing = (paper.data.missing as string[] | undefined) ?? [];
  if (missing.length) throw new JobFileInputError(`Fill ${missing.join(', ')} in the job file and draft again before approving.`);
  const [approved] = await ctx.repo.update<Paper>('ophanim_generated_papers', ctx.actor.organizationId, { id: paperId }, { status: 'approved', approvedByUserId: userOf(ctx), approvedAt: new Date(ctx.now?.() ?? Date.now()).toISOString() });
  await audit(ctx, 'paper.approved', 'job_file', jobFileId, { paperId, kind: paper.kind, version: paper.version });
  return { paper: approved };
}

export async function listPapers(ctx: Ctx, jobFileId: string) {
  const papers = await ctx.repo.select<Paper>('ophanim_generated_papers', ctx.actor.organizationId, { jobFileId }, { order: 'createdAt desc' });
  return Promise.all(papers.map(async paper => ({ id: paper.id, kind: paper.kind, version: paper.version, status: paper.status, missing: (paper.data.missing as string[] | undefined) ?? [], url: paper.storagePath ? await signedUrl(paper.storagePath, ctx.actor.demo).catch(() => null) : null })));
}
