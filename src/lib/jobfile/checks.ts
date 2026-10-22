// Deterministic paperwork checks. Each flag carries severity, an EN/AR message,
// why it matters and how to fix it, plus the fields it came from (for the crop view).
import { both } from '@/lib/i18n';
import { documentLabel } from './document-types';
import { validateAwb, validateContainer } from './identifiers';

export type Severity = 'info' | 'warn' | 'block';
export type BoundingBox = { x: number; y: number; w: number; h: number };
export type FieldValue = { value: string; confidence: number; page: number; bbox?: BoundingBox };
export type InvoiceLine = { description: string; quantity: number; unitPrice: number; amount: number };
export type CheckDocument = { id: string; type: string; fields: Partial<Record<string, FieldValue>>; lines?: InvoiceLine[] };
export type RulePack = { name: string; mode?: string | null; destinationPattern?: string | null; goodsPattern?: string | null; requiredDocuments: string[] };
export type Tolerances = { weightKg: number; weightPct: number; blockWeightPct: number; amount: number; volumePct: number };
export const DEFAULT_TOLERANCES: Tolerances = { weightKg: 2, weightPct: 0.5, blockWeightPct: 5, amount: 0.05, volumePct: 5 };
export type CheckContext = {
  jobId: string; mode: string; origin?: string | null; destination?: string | null; goods?: string | null; clientKey: string;
  documents: CheckDocument[]; rulePacks?: RulePack[]; acceptedDifferences?: Set<string>; tolerances?: Partial<Tolerances>;
  now?: number; departureSoon?: boolean;
};
export type Flag = {
  code: string; severity: Severity; fingerprint: string; documentIds: string[]; fields: Array<{ documentId: string; field: string }>;
  params: Record<string, string | number>; message: { en: string; ar: string }; why: { en: string; ar: string }; fix: { en: string; ar: string };
};

export function makeFlag(code: string, severity: Severity, fingerprint: string, params: Record<string, string | number>, fields: Flag['fields'] = []): Flag {
  return { code, severity, fingerprint, documentIds: [...new Set(fields.map(item => item.documentId))], fields, params,
    message: both(`check.${code}.message`, params), why: both(`check.${code}.why`, params), fix: both(`check.${code}.fix`, params) };
}

export const number = (value?: string) => { if (value === undefined) return null; const parsed = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, '')); return Number.isFinite(parsed) && String(value).match(/\d/) ? parsed : null; };
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const dateOf = (value?: string) => { if (!value) return null; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; };

const SUFFIXES = /\b(L\.?L\.?C|FZE|FZCO|FZ-?LLC|DMCC|LTD|LIMITED|INC|CO|COMPANY|CORP|CORPORATION|PLC|GMBH|EST|ESTABLISHMENT|PVT|PRIVATE|SA|SAS|BV)\b/g;
const EXPANSIONS: Array<[RegExp, string]> = [[/\bTRDG\b/g, 'TRADING'], [/\bINTL\b/g, 'INTERNATIONAL'], [/\bGEN\b/g, 'GENERAL'], [/\bELEC\b/g, 'ELECTRONICS'], [/\bSVCS?\b/g, 'SERVICES'], [/&/g, ' AND ']];
/** Normalise a party name: case, punctuation, legal suffixes and common abbreviations. */
export function normalizeParty(value: string) {
  let text = ` ${value.toUpperCase().replace(/\./g, '').replace(/[,'"()/]/g, ' ')} `;
  for (const [pattern, replacement] of EXPANSIONS) text = text.replace(pattern, replacement);
  return text.replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
}
export const differenceKey = (clientKey: string, code: string, a: string, b: string) => [clientKey, code, ...[a, b].sort()].join('|');

const valuesOf = (documents: CheckDocument[], field: string) => documents.flatMap(document => document.fields[field] ? [{ document, value: document.fields[field]! }] : []);
const fp = (context: CheckContext, code: string, ...parts: string[]) => [code, context.jobId, ...parts].join(':');

function crossNumber(context: CheckContext, field: 'pieces' | 'gross_weight_kg', flags: Flag[]) {
  const tolerance = { ...DEFAULT_TOLERANCES, ...context.tolerances };
  const items = valuesOf(context.documents, field).map(item => ({ ...item, number: number(item.value.value) })).filter(item => item.number !== null);
  if (items.length < 2) return;
  const reference = items[0];
  for (const other of items.slice(1)) {
    const a = reference.number!, b = other.number!, diff = Math.abs(a - b);
    const allowed = field === 'pieces' ? 0 : Math.max(tolerance.weightKg, Math.max(a, b) * tolerance.weightPct / 100);
    if (diff <= allowed) continue;
    const code = field === 'pieces' ? 'pieces_mismatch' : 'weight_mismatch';
    if (context.acceptedDifferences?.has(differenceKey(context.clientKey, code, String(a), String(b)))) continue;
    const severity: Severity = field === 'pieces' || diff / Math.max(a, b) * 100 > tolerance.blockWeightPct ? 'block' : 'warn';
    flags.push(makeFlag(code, severity, fp(context, code, ...[reference.document.id, other.document.id].sort()), {
      a: round(a), b: round(b), diff: round(diff), docA: documentLabel(reference.document.type), docB: documentLabel(other.document.type),
    }, [{ documentId: reference.document.id, field }, { documentId: other.document.id, field }]));
  }
}

function crossParty(context: CheckContext, field: 'shipper' | 'consignee', flags: Flag[]) {
  const items = valuesOf(context.documents, field).filter(item => item.value.value.trim());
  const seen = new Map<string, (typeof items)[number]>();
  for (const item of items) { const key = normalizeParty(item.value.value); if (!seen.has(key)) seen.set(key, item); }
  const distinct = [...seen.entries()];
  for (const [key, item] of distinct.slice(1)) {
    const [firstKey, first] = distinct[0], code = `${field}_mismatch`;
    if (context.acceptedDifferences?.has(differenceKey(context.clientKey, code, firstKey, key))) continue;
    flags.push(makeFlag(code, field === 'consignee' ? 'block' : 'warn', fp(context, code, firstKey, key), { a: first.value.value, b: item.value.value },
      [{ documentId: first.document.id, field }, { documentId: item.document.id, field }]));
  }
}

const HS_CHAPTERS: Array<{ chapter: string; words: RegExp }> = [
  { chapter: '84', words: /\b(LAPTOP|COMPUTER|SERVER|PRINTER|PUMP|ENGINE|MACHINE(RY)?|COMPRESSOR)S?\b/ },
  { chapter: '85', words: /\b(MOBILE PHONE|SMARTPHONE|TELEVISION|TV|CABLE|BATTER(Y|IES)|CHARGER|LED|TRANSFORMER|ELECTRONIC)S?\b/ },
  { chapter: '61', words: /\b(T-?SHIRT|KNIT(TED)?|JERSEY|SWEATER|HOSIERY)S?\b/ },
  { chapter: '62', words: /\b(SHIRT|TROUSER|DRESS|SUIT|JACKET|ABAYA|KANDURA)S?\b/ },
  { chapter: '64', words: /\b(SHOE|FOOTWEAR|SANDAL|BOOT|SNEAKER)S?\b/ },
  { chapter: '30', words: /\b(MEDICINE|PHARMACEUTICAL|TABLET|VACCINE|CAPSULE)S?\b/ },
  { chapter: '33', words: /\b(PERFUME|OUD|COSMETIC|SHAMPOO|LOTION)S?\b/ },
  { chapter: '87', words: /\b(CAR PART|AUTO PART|SPARE PART|TYRE|VEHICLE)S?\b/ },
  { chapter: '94', words: /\b(FURNITURE|SOFA|CHAIR|MATTRESS|LAMP)S?\b/ },
  { chapter: '08', words: /\b(DATE|DATES|FRUIT|BANANA|MANGO|NUT)S?\b/ },
  { chapter: '09', words: /\b(COFFEE|TEA|SPICE|CARDAMOM|SAFFRON)S?\b/ },
  { chapter: '71', words: /\b(GOLD|JEWELLERY|JEWELRY|DIAMOND|PEARL)S?\b/ },
  { chapter: '95', words: /\b(TOY|GAME CONSOLE|DOLL)S?\b/ },
];
const INCOTERMS = new Set(['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']);
const DATE_ORDER = ['invoice_date', 'issue_date', 'departure_date', 'arrival_date'];

/** Parse "120x80x100 cm" with optional "x 3" or "3 @" piece multipliers into cubic metres. */
export function volumeFromDimensions(value: string): number | null {
  let total = 0, found = false;
  for (const part of value.toUpperCase().split(/[;\n]|,(?=\s*\d+\s*(?:@|PCS|X\s*\d))/)) {
    const match = part.match(/(?:(\d+)\s*(?:@|PCS?\s*(?:OF|@)?)\s*)?(\d+(?:\.\d+)?)\s*[X*]\s*(\d+(?:\.\d+)?)\s*[X*]\s*(\d+(?:\.\d+)?)\s*(CM|MM|M)?(?:\s*[X*]\s*(\d+)\b)?/);
    if (!match) continue;
    const unit = match[5] === 'MM' ? 1e-3 : match[5] === 'M' ? 1 : 1e-2, count = Number(match[1] ?? match[6] ?? 1);
    total += Number(match[2]) * unit * Number(match[3]) * unit * Number(match[4]) * unit * count; found = true;
  }
  return found ? round(total, 3) : null;
}

export function runChecks(context: CheckContext): Flag[] {
  const flags: Flag[] = [], tolerance = { ...DEFAULT_TOLERANCES, ...context.tolerances }, now = context.now ?? Date.now();
  crossNumber(context, 'pieces', flags); crossNumber(context, 'gross_weight_kg', flags);
  crossParty(context, 'shipper', flags); crossParty(context, 'consignee', flags);

  for (const document of context.documents) {
    const field = (name: string) => document.fields[name]?.value;
    const hs = field('hs_code')?.replace(/\D/g, ''), description = field('description')?.toUpperCase();
    if (hs && description) {
      const expected = HS_CHAPTERS.find(item => item.words.test(description));
      if (expected && hs.slice(0, 2) !== expected.chapter) flags.push(makeFlag('hs_code_plausibility', 'info', fp(context, 'hs', document.id), { code: hs, description: field('description')!, expected: expected.chapter }, [{ documentId: document.id, field: 'hs_code' }]));
    }
    if (document.lines?.length) {
      const sum = round(document.lines.reduce((total, line) => total + line.amount, 0)), subtotal = number(field('invoice_subtotal')) ?? (number(field('invoice_total')) !== null && number(field('vat_amount')) !== null ? number(field('invoice_total'))! - number(field('vat_amount'))! : number(field('invoice_total')));
      const lineErrors = document.lines.filter(line => Math.abs(line.quantity * line.unitPrice - line.amount) > tolerance.amount);
      if ((subtotal !== null && Math.abs(sum - subtotal) > tolerance.amount) || lineErrors.length) flags.push(makeFlag('invoice_lines_total', 'warn', fp(context, 'lines', document.id), { sum, total: subtotal ?? sum }, [{ documentId: document.id, field: 'invoice_total' }]));
    }
    const subtotal = number(field('invoice_subtotal')), vat = number(field('vat_amount'));
    if (subtotal && vat !== null) {
      const rate = round(vat / subtotal * 100, 2);
      if (Math.abs(rate - 5) > 0.1 && vat !== 0) flags.push(makeFlag('vat_sensible', 'warn', fp(context, 'vat', document.id), { vat, subtotal, rate }, [{ documentId: document.id, field: 'vat_amount' }]));
    }
    const incoterm = field('incoterm');
    if (incoterm && !INCOTERMS.has(incoterm.trim().toUpperCase().split(/\s/)[0])) flags.push(makeFlag('incoterm_invalid', 'warn', fp(context, 'incoterm', document.id), { value: incoterm }, [{ documentId: document.id, field: 'incoterm' }]));
    const gross = number(field('gross_weight_kg')), volume = number(field('volume_cbm')), chargeable = number(field('chargeable_weight_kg'));
    if (context.mode.startsWith('air') && gross !== null && volume !== null && chargeable !== null) {
      const computed = round(Math.max(gross, volume * 1e6 / 6000), 1);
      if (chargeable + 0.5 < computed) flags.push(makeFlag('chargeable_weight', 'warn', fp(context, 'chargeable', document.id), { stated: chargeable, computed, gross, volume }, [{ documentId: document.id, field: 'chargeable_weight_kg' }]));
    }
    const dimensions = field('dimensions'), fromDims = dimensions ? volumeFromDimensions(dimensions) : null;
    if (volume !== null && fromDims !== null && Math.abs(volume - fromDims) / Math.max(volume, fromDims) * 100 > tolerance.volumePct) flags.push(makeFlag('volume_dimensions', 'warn', fp(context, 'volume', document.id), { stated: volume, computed: fromDims }, [{ documentId: document.id, field: 'volume_cbm' }, { documentId: document.id, field: 'dimensions' }]));
    for (const name of DATE_ORDER) {
      const at = dateOf(field(name));
      if (at !== null && (at < now - 2 * 366 * 864e5 || at > now + 366 * 864e5)) flags.push(makeFlag('date_impossible', 'warn', fp(context, 'date', document.id, name), { field: name.replace(/_/g, ' '), date: field(name)! }, [{ documentId: document.id, field: name }]));
    }
    const awb = field('awb_number');
    if (awb) { const result = validateAwb(awb); if (!result.valid) flags.push(makeFlag('awb_check_digit', result.code === 'unknown_prefix' ? 'warn' : 'block', fp(context, 'awb', result.normalized), { value: result.normalized, detail: result.detail ?? '' }, [{ documentId: document.id, field: 'awb_number' }])); }
    const container = field('container_number');
    if (container) { const result = validateContainer(container); if (!result.valid) flags.push(makeFlag('container_check_digit', 'block', fp(context, 'container', result.normalized), { value: result.normalized, detail: result.detail ?? '' }, [{ documentId: document.id, field: 'container_number' }])); }
  }

  // Dates across all documents must follow invoice → issue → departure → arrival.
  const dated = DATE_ORDER.map(name => ({ name, item: valuesOf(context.documents, name).map(entry => ({ ...entry, at: dateOf(entry.value.value) })).find(entry => entry.at !== null) })).filter(entry => entry.item);
  for (let index = 1; index < dated.length; index++) {
    const before = dated[index - 1], after = dated[index];
    if (before.item!.at! > after.item!.at! + 864e5) flags.push(makeFlag('dates_order', 'warn', fp(context, 'dates', before.name, after.name), { first: before.name.replace(/_/g, ' '), firstDate: before.item!.value.value, second: after.name.replace(/_/g, ' '), secondDate: after.item!.value.value }, [{ documentId: before.item!.document.id, field: before.name }, { documentId: after.item!.document.id, field: after.name }]));
  }

  const currencies = [...new Set(valuesOf(context.documents, 'currency').map(item => item.value.value.trim().toUpperCase()).filter(Boolean))];
  if (currencies.length > 1) flags.push(makeFlag('currency_inconsistent', 'warn', fp(context, 'currency', ...currencies.sort()), { currencies: currencies.join(', ') }, valuesOf(context.documents, 'currency').map(item => ({ documentId: item.document.id, field: 'currency' }))));

  for (const pack of applicableRulePacks(context)) {
    for (const required of pack.requiredDocuments) {
      if (context.documents.some(document => document.type === required)) continue;
      flags.push(makeFlag('missing_document', context.departureSoon ? 'block' : 'warn', fp(context, 'missing', required), { document: documentLabel(required), pack: pack.name }));
    }
  }
  const unique = new Map(flags.map(flag => [flag.fingerprint, flag]));
  return [...unique.values()];
}

export const DEFAULT_RULE_PACKS: RulePack[] = [
  { name: 'Air import basics', mode: 'air_import', requiredDocuments: ['air_waybill', 'commercial_invoice', 'packing_list'] },
  { name: 'Air export basics', mode: 'air_export', requiredDocuments: ['commercial_invoice', 'packing_list', 'export_declaration'] },
  { name: 'Sea import basics', mode: 'sea_import', requiredDocuments: ['bill_of_lading', 'commercial_invoice', 'packing_list'] },
  { name: 'Sea export basics', mode: 'sea_export', requiredDocuments: ['commercial_invoice', 'packing_list', 'export_declaration'] },
  // Example route rule. Confirm route requirements with the customer before relying on it.
  { name: 'GCC destination: certificate of origin', mode: null, destinationPattern: '\\b(RUH|JED|DMM|MCT|SLL|KWI|BAH|DOH|SA|OM|KW|BH|QA)\\b', requiredDocuments: ['certificate_of_origin'] },
];
export function applicableRulePacks(context: Pick<CheckContext, 'mode' | 'destination' | 'goods' | 'rulePacks'>) {
  return (context.rulePacks ?? DEFAULT_RULE_PACKS).filter(pack => (!pack.mode || pack.mode === context.mode)
    && (!pack.destinationPattern || new RegExp(pack.destinationPattern, 'i').test(context.destination ?? ''))
    && (!pack.goodsPattern || new RegExp(pack.goodsPattern, 'i').test(context.goods ?? '')));
}
