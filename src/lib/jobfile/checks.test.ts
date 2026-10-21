import { describe, expect, it } from 'vitest';
import { classifyDocument } from './document-types';
import { differenceKey, normalizeParty, runChecks, volumeFromDimensions, type CheckDocument } from './checks';

const f = (value: string, page = 1) => ({ value, confidence: 0.95, page, bbox: { x: 0.1, y: 0.2, w: 0.2, h: 0.04 } });
const base = { jobId: 'job-1', mode: 'air_import', destination: 'DXB', clientKey: 'client-1', now: Date.parse('2026-10-21T00:00:00Z'), rulePacks: [] };
const invoice: CheckDocument = { id: 'inv', type: 'commercial_invoice', fields: { pieces: f('12'), gross_weight_kg: f('1,240.0'), shipper: f('Shenzhen Bright Elec. Co., Ltd'), consignee: f('Gulf Star Trdg LLC'), currency: f('USD') } };
const packing: CheckDocument = { id: 'pl', type: 'packing_list', fields: { pieces: f('12'), gross_weight_kg: f('1249'), shipper: f('SHENZHEN BRIGHT ELECTRONICS CO LTD'), consignee: f('Gulf Star Trading L.L.C.'), currency: f('USD') } };

describe('cross-document checks', () => {
  it('flags a 9 kg weight difference once, as a warning with an EN/AR fix', () => {
    const flags = runChecks({ ...base, documents: [invoice, packing] });
    expect(flags).toHaveLength(1);
    const [flag] = flags;
    expect(flag).toMatchObject({ code: 'weight_mismatch', severity: 'warn', documentIds: ['inv', 'pl'] });
    expect(flag.message.en).toContain('9 kg'); expect(flag.fix.ar.length).toBeGreaterThan(10); expect(flag.message.ar).toContain('9');
    expect(flag.fields).toEqual([{ documentId: 'inv', field: 'gross_weight_kg' }, { documentId: 'pl', field: 'gross_weight_kg' }]);
  });
  it('stays quiet inside tolerance and remembers accepted differences', () => {
    expect(runChecks({ ...base, documents: [invoice, { ...packing, fields: { ...packing.fields, gross_weight_kg: f('1244') } }] })).toEqual([]);
    const accepted = new Set([differenceKey('client-1', 'weight_mismatch', '1240', '1249')]);
    expect(runChecks({ ...base, documents: [invoice, packing], acceptedDifferences: accepted })).toEqual([]);
  });
  it('blocks piece and consignee mismatches; normalises abbreviations', () => {
    expect(normalizeParty('Gulf Star Trdg LLC')).toBe(normalizeParty('GULF STAR TRADING L.L.C.'));
    const flags = runChecks({ ...base, documents: [invoice, { ...packing, fields: { ...packing.fields, pieces: f('11'), gross_weight_kg: f('1240'), consignee: f('Gulf Moon General Trading') } }] });
    expect(flags.map(flag => [flag.code, flag.severity])).toEqual([['pieces_mismatch', 'block'], ['consignee_mismatch', 'block']]);
  });
  it('checks invoice arithmetic, VAT, currency and Incoterms', () => {
    const doc: CheckDocument = { id: 'i2', type: 'commercial_invoice', fields: { invoice_subtotal: f('1000'), vat_amount: f('70'), invoice_total: f('1070'), incoterm: f('FOBB'), currency: f('AED') },
      lines: [{ description: 'A', quantity: 2, unitPrice: 300, amount: 600 }, { description: 'B', quantity: 1, unitPrice: 350, amount: 350 }] };
    const codes = runChecks({ ...base, documents: [doc, invoice] }).map(flag => flag.code);
    expect(codes).toEqual(expect.arrayContaining(['invoice_lines_total', 'vat_sensible', 'incoterm_invalid', 'currency_inconsistent']));
  });
  it('applies the air volumetric rule and dimension volume', () => {
    expect(volumeFromDimensions('3 @ 100x100x100 cm')).toBe(3);
    expect(volumeFromDimensions('120x80x100 cm x 2')).toBe(1.92);
    const awb: CheckDocument = { id: 'awb', type: 'air_waybill', fields: { gross_weight_kg: f('300'), volume_cbm: f('3'), chargeable_weight_kg: f('300'), dimensions: f('3 @ 100x100x100 cm') } };
    const flag = runChecks({ ...base, documents: [awb] }).find(item => item.code === 'chargeable_weight');
    expect(flag?.params).toMatchObject({ computed: 500, stated: 300 });
  });
  it('validates check digits, dates and HS plausibility', () => {
    const doc: CheckDocument = { id: 'awb', type: 'air_waybill', fields: { awb_number: f('176-12345676'), container_number: f('CSQU3054384'), hs_code: f('6204.42'), description: f('Laptop computers'), issue_date: f('2026-10-18'), arrival_date: f('2026-10-10'), invoice_date: f('2062-10-01') } };
    const codes = runChecks({ ...base, documents: [doc] }).map(flag => flag.code);
    expect(codes).toEqual(expect.arrayContaining(['awb_check_digit', 'container_check_digit', 'hs_code_plausibility', 'dates_order', 'date_impossible']));
  });
  it('flags missing route documents, blocking close to departure', () => {
    const flags = runChecks({ ...base, rulePacks: undefined, destination: 'RUH', mode: 'air_export', documents: [invoice], departureSoon: true });
    expect(flags.filter(flag => flag.code === 'missing_document').map(flag => flag.params.document)).toEqual(['Packing list', 'Export declaration', 'Certificate of origin']);
    expect(flags.find(flag => flag.code === 'missing_document')?.severity).toBe('block');
  });
  it('classifies document types from text', () => {
    expect(classifyDocument('COMMERCIAL INVOICE  Invoice No 44  Unit price  Amount').code).toBe('commercial_invoice');
    expect(classifyDocument('PACKING LIST  carton  net weight').code).toBe('packing_list');
    expect(classifyDocument('HOUSE AIR WAYBILL HAWB 778812 Not negotiable').code).toBe('house_air_waybill');
    expect(classifyDocument('hello').code).toBe('other');
  });
});
