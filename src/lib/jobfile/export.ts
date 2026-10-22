// CSV and .xlsx exports of job files, milestones, documents, flags and invoices,
// so data flows back into the customer's own tools without retyping.
import { strToU8, zipSync } from 'fflate';
import { escapeCsvCell } from '@/lib/imports/csv';
import type { Ctx, FlagRecord, Invoice, JobDocument, JobFile, JobMilestone, JobReference } from './types';

export type Sheet = { name: string; rows: Array<Array<string | number | null>> };
export const EXPORT_ENTITIES = ['jobs', 'milestones', 'documents', 'flags', 'invoices'] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

const xml = (value: string) => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]!)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
const column = (index: number) => { let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name; };
/** Formula-looking text is written as plain text, never as a formula. */
const safeText = (value: string) => /^[=+\-@]/.test(value.trim()) ? `'${value}` : value;

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`),
  };
  sheets.forEach((sheet, index) => {
    const rows = sheet.rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => cell === null || cell === undefined || cell === '' ? '' : typeof cell === 'number' && Number.isFinite(cell)
      ? `<c r="${column(c)}${r + 1}"><v>${cell}</v></c>` : `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(safeText(String(cell)))}</t></is></c>`).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
  });
  return zipSync(files, { level: 6 });
}
export const buildCsv = (sheet: Sheet) => sheet.rows.map(row => row.map(cell => escapeCsvCell(cell ?? '')).join(',')).join('\r\n') + '\r\n';

export async function exportSheets(ctx: Ctx, entities: ExportEntity[], jobFileId?: string): Promise<Sheet[]> {
  const org = ctx.actor.organizationId, scope = jobFileId ? { jobFileId } : {};
  const jobs = await ctx.repo.select<JobFile>('ophanim_job_files', org, jobFileId ? { id: jobFileId } : {}, { order: 'createdAt' });
  const number = new Map(jobs.map(job => [job.id, job.jobNumber])), sheets: Sheet[] = [];
  if (entities.includes('jobs')) {
    const references = await ctx.repo.select<JobReference>('ophanim_job_references', org, scope);
    const refs = (job: JobFile, type: string) => references.filter(item => item.jobFileId === job.id && item.type === type).map(item => item.normalizedValue).join(' ');
    sheets.push({ name: 'Job files', rows: [['Job number', 'Mode', 'Status', 'Client', 'Origin', 'Destination', 'Planned departure', 'Planned arrival', 'AWB', 'HAWB', 'B/L', 'Container', 'Synthetic'],
      ...jobs.map(job => [job.jobNumber, job.mode, job.status, job.clientName, job.origin, job.destination, job.plannedDepartureAt, job.plannedArrivalAt, refs(job, 'awb'), refs(job, 'hawb'), refs(job, 'bl'), refs(job, 'container'), job.isSynthetic ? 'SYNTHETIC DEMO' : ''])] });
  }
  if (entities.includes('milestones')) {
    const rows = await ctx.repo.select<JobMilestone>('ophanim_job_milestones', org, scope, { order: 'sequence' });
    sheets.push({ name: 'Milestones', rows: [['Job number', 'Milestone', 'Planned', 'Expected', 'Actual', 'Source', 'Confidence', 'Needs confirmation'], ...rows.map(row => [number.get(row.jobFileId) ?? '', row.code, row.plannedAt, row.expectedAt, row.actualAt, row.source, row.confidence, row.needsConfirmation ? 'yes' : ''])] });
  }
  if (entities.includes('documents')) {
    const rows = await ctx.repo.select<JobDocument>('ophanim_documents', org, scope, { order: 'createdAt' });
    sheets.push({ name: 'Documents', rows: [['Job number', 'Type', 'File', 'Received via', 'Received at', 'Version', 'Reader'], ...rows.filter(row => !jobFileId || row.jobFileId === jobFileId).map(row => [number.get(row.jobFileId ?? '') ?? '', row.docTypeCode, row.originalFileName, row.receivedVia, row.receivedAt, row.versionNumber, row.reader])] });
  }
  if (entities.includes('flags')) {
    const rows = await ctx.repo.select<FlagRecord>('ophanim_job_checks', org, scope, { order: 'createdAt' });
    sheets.push({ name: 'Flags', rows: [['Job number', 'Check', 'Severity', 'Status', 'Message', 'Fix', 'Raised'], ...rows.map(row => [number.get(row.jobFileId ?? '') ?? '', row.checkCode, row.severity, row.status, row.messageEn, row.fixEn, row.createdAt])] });
  }
  if (entities.includes('invoices')) {
    const rows = await ctx.repo.select<Invoice>('ophanim_invoices', org, scope, { order: 'createdAt' });
    sheets.push({ name: 'Invoices', rows: [['Job number', 'Direction', 'Counterparty', 'Invoice number', 'Currency', 'Subtotal', 'VAT', 'Total', 'Status', 'E-invoice', 'Issued', 'Due', 'Paid'], ...rows.map(row => [number.get(row.jobFileId ?? '') ?? '', row.direction, row.counterpartyName, row.invoiceNumber, row.currency, row.subtotal, row.vatAmount, row.total, row.status, row.einvoiceStatus, row.issuedAt, row.dueAt, row.paidAt])] });
  }
  return sheets;
}
