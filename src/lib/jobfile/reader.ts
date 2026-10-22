// Document reader interface with three implementations:
//  1. OpenAI-compatible vision model (central AI config; needs classify_document enabled)
//  2. Local Tesseract OCR, English + Arabic (TESSERACT_PATH), labelled lower confidence
//  3. Text reader for text/PDF-text attachments (no crop boxes)
// All return fields with confidence, page and bounding box (0–1 page fractions).
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getServerAiConfig } from '@/lib/ai/config';
import { aiAuthorization, aiEndpoint, validateAiBaseUrl } from '@/lib/ai/providers/openai-compatible-provider';
import { providerError } from '@/lib/ai/providers/provider-error';
import type { BoundingBox, InvoiceLine } from './checks';
import { classifyDocument, DEFAULT_DOCUMENT_TYPES, FIELD_DEFINITIONS, type DocumentTypeDefinition } from './document-types';

export type ReadField = { field: string; value: string; confidence: number; page: number; bbox: BoundingBox | null };
export type ReadResult = { reader: 'vision' | 'tesseract' | 'text' | 'none'; docType: string; typeConfidence: number; pages: number; fields: ReadField[]; lines: InvoiceLine[]; text: string; note?: string };
export interface DocumentReader { name: ReadResult['reader']; available(mimeType: string): boolean; read(input: { bytes: Buffer; mimeType: string; text?: string | null; types?: DocumentTypeDefinition[] }): Promise<ReadResult> }

const FIELD_NAMES = new Set(FIELD_DEFINITIONS.map(item => item.field));
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

// ---- Heuristic extraction from lines of text (OCR or plain text) -------------
export type TextLine = { text: string; page: number; bbox: BoundingBox | null; confidence: number };
const NUMBER = '(\\d{1,3}(?:[,\\s]\\d{3})*(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const DATE = '(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[-/ ](?:\\d{1,2}|[A-Za-z]{3})[-/ ]\\d{2,4})';
const PATTERNS: Array<{ field: string; pattern: RegExp; next?: boolean }> = [
  { field: 'awb_number', pattern: /\b(?:MAWB|AWB|AIR WAYBILL)\b[^\d]{0,12}(\d{3}[-\s]?\d{4}\s?\d{4})/i },
  { field: 'hawb_number', pattern: /\bHAWB\b[\s:#.No]*([A-Z0-9-]{5,20})/i },
  { field: 'bl_number', pattern: /\b(?:B\/L|BILL OF LADING)\s*(?:NO\.?|NUMBER)?[\s:#]*([A-Z]{4}\d{6,12})/i },
  { field: 'container_number', pattern: /\b([A-Z]{3}[UJZ]\s?\d{6}\s?\d)\b/ },
  { field: 'invoice_number', pattern: /\bINVOICE\s*(?:NO\.?|NUMBER|#)[\s:#]*([A-Z0-9][A-Z0-9/-]{2,20})/i },
  { field: 'pieces', pattern: new RegExp(`\\b(?:NO\\.? OF (?:PIECES|PCS|PACKAGES)|PIECES|PCS|PKGS|PACKAGES|CARTONS|CTNS)\\b[\\s:]*${NUMBER}`, 'i') },
  { field: 'gross_weight_kg', pattern: new RegExp(`\\b(?:GROSS\\s*(?:WEIGHT|WT\\.?)|G\\.?\\s?W\\.?)\\b[^\\d]{0,10}${NUMBER}\\s*(?:KGS?|KG)?`, 'i') },
  { field: 'chargeable_weight_kg', pattern: new RegExp(`\\bCHARGEABLE\\s*(?:WEIGHT|WT\\.?)\\b[^\\d]{0,10}${NUMBER}`, 'i') },
  { field: 'volume_cbm', pattern: new RegExp(`\\b(?:VOLUME|CBM|MEASUREMENT)\\b[^\\d]{0,10}${NUMBER}\\s*(?:CBM|M3|M³)?`, 'i') },
  { field: 'dimensions', pattern: /\b(?:DIMS?|DIMENSIONS?)\b[\s:]*([0-9][0-9xX*@ .,;CMm]{5,80})/i },
  { field: 'hs_code', pattern: /\b(?:HS\s*CODE|H\.S\.|HTS)\b[\s:#]*(\d{4}(?:\.?\d{2}){0,3})/i },
  { field: 'incoterm', pattern: /\b(?:INCOTERMS?|TERMS OF DELIVERY|DELIVERY TERMS)\b[\s:]*([A-Z]{3})\b/i },
  { field: 'currency', pattern: /\b(?:CURRENCY)\b[\s:]*([A-Z]{3})\b/i },
  { field: 'invoice_subtotal', pattern: new RegExp(`\\bSUB\\s*-?TOTAL\\b[^\\d]{0,12}${NUMBER}`, 'i') },
  { field: 'vat_amount', pattern: new RegExp(`\\bVAT\\b(?:\\s*\\(?\\d+%\\)?)?[^\\d]{0,10}${NUMBER}`, 'i') },
  { field: 'invoice_total', pattern: new RegExp(`\\b(?:GRAND TOTAL|TOTAL AMOUNT|TOTAL)\\b[^\\d]{0,12}${NUMBER}`, 'i') },
  { field: 'invoice_date', pattern: new RegExp(`\\bINVOICE DATE\\b[\\s:]*${DATE}`, 'i') },
  { field: 'issue_date', pattern: new RegExp(`\\b(?:DATE OF ISSUE|ISSUE DATE|EXECUTED ON|DATE)\\b[\\s:]*${DATE}`, 'i') },
  { field: 'arrival_date', pattern: new RegExp(`\\b(?:ETA|ARRIVAL DATE|DATE OF ARRIVAL)\\b[\\s:]*${DATE}`, 'i') },
  { field: 'departure_date', pattern: new RegExp(`\\b(?:ETD|DEPARTURE DATE|FLIGHT DATE|ON BOARD)\\b[\\s:]*${DATE}`, 'i') },
  { field: 'flight', pattern: /\bFLIGHT(?:\s*NO\.?)?\b[\s:/]*([A-Z0-9]{2}\s?\d{2,4})/i },
  { field: 'shipper', pattern: /\bSHIPPER(?:'S)?(?:\s*NAME(?: AND ADDRESS)?)?\b[\s:]*(.{3,80})?$/i, next: true },
  { field: 'consignee', pattern: /\bCONSIGNEE(?:'S)?(?:\s*NAME(?: AND ADDRESS)?)?\b[\s:]*(.{3,80})?$/i, next: true },
  { field: 'description', pattern: /\b(?:DESCRIPTION OF GOODS|NATURE AND QUANTITY OF GOODS|DESCRIPTION)\b[\s:]*(.{3,120})?$/i, next: true },
];
export function extractFromLines(lines: TextLine[], baseConfidence: number): ReadField[] {
  const found = new Map<string, ReadField>();
  lines.forEach((line, index) => {
    for (const { field, pattern, next } of PATTERNS) {
      if (found.has(field)) continue;
      const match = line.text.match(pattern); if (!match) continue;
      let value = match[1]?.trim(), source = line;
      if (!value && next && lines[index + 1]) { source = lines[index + 1]; value = source.text.trim(); }
      if (!value) continue;
      if (['pieces', 'gross_weight_kg', 'chargeable_weight_kg', 'volume_cbm', 'invoice_subtotal', 'vat_amount', 'invoice_total'].includes(field)) value = value.replace(/[\s,]/g, '');
      found.set(field, { field, value: value.slice(0, 200), confidence: clamp(baseConfidence * source.confidence), page: source.page, bbox: source.bbox });
    }
  });
  return [...found.values()];
}
export function extractInvoiceLines(text: string): InvoiceLine[] {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(.{3,80}?)\s+(\d+(?:\.\d+)?)\s+(?:PCS|PC|UNITS?|SETS?)?\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/i);
    return match ? [{ description: match[1].trim(), quantity: Number(match[2]), unitPrice: Number(match[3].replace(/,/g, '')), amount: Number(match[4].replace(/,/g, '')) }] : [];
  });
}

export const textReader: DocumentReader = {
  name: 'text',
  available: () => true,
  async read({ text, types }) {
    const source = text ?? '';
    const lines = source.split(/\r?\n/).map(value => value.trim()).filter(Boolean).map(value => ({ text: value, page: 1, bbox: null, confidence: 1 }));
    const kind = classifyDocument(source, types);
    return { reader: 'text', docType: kind.code, typeConfidence: kind.confidence, pages: 1, fields: extractFromLines(lines, 0.85), lines: extractInvoiceLines(source), text: source };
  },
};

// ---- Tesseract (local OCR, eng+ara) ---------------------------------------------
const run = (file: string, args: string[]) => new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 60000, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
/** Group Tesseract TSV words into lines with normalised bounding boxes. */
export function linesFromTsv(tsv: string): TextLine[] {
  const rows = tsv.trim().split(/\r?\n/).slice(1).map(line => line.split('\t'));
  const page = rows.find(row => row[0] === '1'), width = Number(page?.[8] ?? 1), height = Number(page?.[9] ?? 1);
  const groups = new Map<string, { words: string[]; left: number; top: number; right: number; bottom: number; conf: number[] }>();
  for (const row of rows) {
    if (row[0] !== '5' || !row[11]?.trim() || Number(row[10]) < 0) continue;
    const key = `${row[1]}:${row[2]}:${row[3]}:${row[4]}`, [left, top, w, h] = row.slice(6, 10).map(Number);
    const group = groups.get(key) ?? { words: [], left, top, right: left + w, bottom: top + h, conf: [] };
    group.words.push(row[11]); group.left = Math.min(group.left, left); group.top = Math.min(group.top, top); group.right = Math.max(group.right, left + w); group.bottom = Math.max(group.bottom, top + h); group.conf.push(Number(row[10]) / 100);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ text: group.words.join(' '), page: 1, confidence: group.conf.reduce((a, b) => a + b, 0) / group.conf.length,
    bbox: { x: group.left / width, y: group.top / height, w: (group.right - group.left) / width, h: (group.bottom - group.top) / height } }));
}
export const tesseractReader: DocumentReader = {
  name: 'tesseract',
  available: mimeType => Boolean(process.env.TESSERACT_PATH) && mimeType.startsWith('image/'),
  async read({ bytes, types }) {
    const directory = await mkdtemp(path.join(tmpdir(), 'ophanim-ocr-'));
    try {
      const file = path.join(directory, 'page'); await writeFile(file, bytes, { mode: 0o600 });
      const tsv = await run(process.env.TESSERACT_PATH!, [file, 'stdout', '-l', process.env.TESSERACT_LANGUAGES || 'eng+ara', 'tsv']);
      const lines = linesFromTsv(tsv), text = lines.map(line => line.text).join('\n'), kind = classifyDocument(text, types);
      // Local OCR is labelled lower confidence; it never auto-accepts on its own.
      return { reader: 'tesseract', docType: kind.code, typeConfidence: kind.confidence * 0.9, pages: 1, fields: extractFromLines(lines, 0.75), lines: extractInvoiceLines(text), text, note: 'Lower confidence: local OCR' };
    } finally { await rm(directory, { recursive: true, force: true }); }
  },
};

// ---- Vision model (OpenAI-compatible) -------------------------------------------
/** Document reading uses the central AI server settings and must be switched on explicitly (JOBFILE_AI_READING=true). */
export function visionConfigured() {
  return Boolean(getServerAiConfig() && process.env.JOBFILE_AI_READING === 'true');
}
/** One JSON chat call to the central OpenAI-compatible server (used for email milestones). */
export async function aiJson(instruction: string, input: string): Promise<unknown> {
  const config = getServerAiConfig();
  if (!config) throw new Error('AI is not configured.');
  await validateAiBaseUrl(config.baseUrl);
  const response = await fetch(aiEndpoint(config.baseUrl), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { 'Content-Type': 'application/json', ...aiAuthorization(config.apiKey) },
    body: JSON.stringify({ model: config.model, temperature: 0, max_tokens: 1024, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: instruction }, { role: 'user', content: input }] }) });
  if (!response.ok) throw await providerError(response);
  const content = ((await response.json()) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? '';
  return JSON.parse(content.replace(/^```(?:json)?|```$/g, '').trim());
}
export function parseVisionJson(content: string, types = DEFAULT_DOCUMENT_TYPES): Omit<ReadResult, 'reader' | 'text'> {
  const json = JSON.parse(content.replace(/^```(?:json)?|```$/g, '').trim()) as { doc_type?: string; type_confidence?: number; pages?: number; fields?: unknown[]; lines?: unknown[] };
  const codes = new Set(types.map(type => type.code));
  const fields = (Array.isArray(json.fields) ? json.fields : []).flatMap(item => {
    const field = item as { field?: string; value?: unknown; confidence?: number; page?: number; bbox?: Partial<BoundingBox> };
    if (!field.field || !FIELD_NAMES.has(field.field) || field.value === undefined || field.value === null) return [];
    const box = field.bbox && ['x', 'y', 'w', 'h'].every(key => typeof field.bbox![key as keyof BoundingBox] === 'number') ? { x: clamp(field.bbox.x!), y: clamp(field.bbox.y!), w: clamp(field.bbox.w!), h: clamp(field.bbox.h!) } : null;
    return [{ field: field.field, value: String(field.value).slice(0, 200), confidence: clamp(Number(field.confidence ?? 0.5)), page: Math.max(1, Math.floor(Number(field.page ?? 1))), bbox: box }];
  });
  const lines = (Array.isArray(json.lines) ? json.lines : []).flatMap(item => { const line = item as Partial<InvoiceLine>; return [line.description, line.quantity, line.unitPrice, line.amount].every(value => value !== undefined) ? [{ description: String(line.description), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), amount: Number(line.amount) }] : []; });
  return { docType: json.doc_type && codes.has(json.doc_type) ? json.doc_type : 'other', typeConfidence: clamp(Number(json.type_confidence ?? 0.5)), pages: Math.max(1, Number(json.pages ?? 1)), fields, lines };
}
export const visionReader: DocumentReader = {
  name: 'vision',
  available: mimeType => visionConfigured() && (mimeType.startsWith('image/') || mimeType === 'application/pdf'),
  async read({ bytes, mimeType, types = DEFAULT_DOCUMENT_TYPES }) {
    const config = getServerAiConfig()!;
    await validateAiBaseUrl(config.baseUrl);
    const instruction = `Read this logistics document. Reply with JSON only: {"doc_type": one of ${types.map(type => type.code).join('|')}|other, "type_confidence": 0-1, "pages": n, "fields": [{"field": one of ${[...FIELD_NAMES].join('|')}, "value": "as printed", "confidence": 0-1, "page": n, "bbox": {"x","y","w","h"} as fractions of the page}], "lines": [{"description","quantity","unitPrice","amount"}]}. Copy values exactly as printed; never guess missing values.`;
    const response = await fetch(aiEndpoint(config.baseUrl), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000), headers: { 'Content-Type': 'application/json', ...aiAuthorization(config.apiKey) },
      body: JSON.stringify({ model: process.env.JOBFILE_VISION_MODEL || config.model, temperature: 0, max_tokens: 2048, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${bytes.toString('base64')}` } }] }] }),
    });
    if (!response.ok) throw await providerError(response);
    const content = ((await response.json()) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? '';
    const parsed = parseVisionJson(content, types);
    return { reader: 'vision', ...parsed, text: parsed.fields.map(field => `${field.field}: ${field.value}`).join('\n') };
  },
};

/** Pick the best available reader: vision → Tesseract (images) → text. Never throws for "no reader". */
export async function readDocument(input: { bytes: Buffer; mimeType: string; text?: string | null; types?: DocumentTypeDefinition[] }, readers: DocumentReader[] = [visionReader, tesseractReader]): Promise<ReadResult> {
  for (const reader of readers) {
    if (!reader.available(input.mimeType)) continue;
    try { return await reader.read(input); } catch (error) { console.warn(`[jobfile] ${reader.name} reader failed:`, error instanceof Error ? error.message : 'error'); }
  }
  if (input.text?.trim()) return textReader.read(input);
  return { reader: 'none', docType: 'other', typeConfidence: 0, pages: 1, fields: [], lines: [], text: '', note: 'No document reader configured. Configure a vision model (AI_*) or TESSERACT_PATH, or type the values.' };
}
