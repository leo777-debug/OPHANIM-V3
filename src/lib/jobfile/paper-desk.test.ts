import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
// Real (non-demo) actors use the private filesystem store in these tests.
process.env.KNOWLEDGE_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), 'ophanim-jobfile-test-'));
import { confirmField, fieldPassesChecks, myStats, processDocument, resolveFlag, searchDocuments, teamStats, tiredHands } from './paper-desk';
import { extractFromLines, linesFromTsv, parseVisionJson, readDocument, textReader, type ReadResult } from './reader';
import { memoryRepo } from './repo';
import { createJobFile, loadJob, receiveIntake } from './service';
import type { Ctx } from './types';

const ORG = '00000000-0000-4000-8000-0000000000c1', USER = '00000000-0000-4000-8000-0000000000c2';
const box = (y: number) => ({ x: 0.55, y, w: 0.2, h: 0.03 });
const photo = (name: string) => ({ fileName: name, mimeType: 'image/jpeg', bytes: Buffer.from(`synthetic jpeg ${name}`) });
const read = (docType: string, weight: string): ReadResult => ({ reader: 'vision', docType, typeConfidence: 0.95, pages: 1, text: '', lines: [], fields: [
  { field: 'pieces', value: '12', confidence: 0.97, page: 1, bbox: box(0.30) },
  { field: 'gross_weight_kg', value: weight, confidence: 0.96, page: 1, bbox: box(0.34) },
  { field: 'consignee', value: 'Gulf Star Trading LLC', confidence: 0.9, page: 1, bbox: box(0.12) },
] });

describe('Paper Desk', () => {
  it('flags a 9 kg invoice/packing-list difference once with a bilingual fix, a crop box and a lesson', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: USER, role: 'analyst', demo: false } };
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-7001', clientName: 'Gulf Star Trading LLC', references: [{ type: 'awb', value: '176-12345675' }] });
    const intake = await receiveIntake(ctx, { channel: 'photo', bodyText: 'AWB 176-12345675', attachments: [photo('invoice.jpg'), photo('packing.jpg')] });
    expect(intake.decision.jobFileId).toBe(job.id);
    const [invoice, packing] = intake.documents;
    await processDocument(ctx, invoice.id, read('commercial_invoice', '1240'));
    await processDocument(ctx, packing.id, read('packing_list', '1249'));
    let view = (await loadJob(ctx, job.id))!;
    const open = view.flags.filter(flag => flag.status === 'open' && flag.checkCode !== 'missing_document');
    expect(open).toHaveLength(1);
    const [flag] = open;
    expect(flag).toMatchObject({ checkCode: 'weight_mismatch', severity: 'warn' });
    expect(flag.fixEn).toMatch(/weight slip/i); expect(flag.fixAr).toMatch(/إيصال الوزن/);
    // Crop view: every value keeps the page and box it came from; flagged values are not auto-accepted.
    const weightField = view.documents.find(document => document.id === packing.id)!.fields!.find(field => field.field === 'gross_weight_kg')!;
    expect(weightField).toMatchObject({ page: 1, bbox: box(0.34), status: 'suggested' });
    expect(view.documents.find(document => document.id === packing.id)!.fields!.find(field => field.field === 'pieces')!.status).toBe('auto_accepted');
    // Correcting the packing list value clears the flag; fixing another flag shows a lesson.
    const result = await resolveFlag(ctx, job.id, flag.id, 'fixed');
    expect(result.lesson?.lessonEn).toMatch(/gross weight/i); expect(result.lesson?.lessonAr.length).toBeGreaterThan(10);
    expect(result.lesson?.exampleEn).toContain('9 kg');
    await confirmField(ctx, weightField.id, 'correct', '1240');
    view = (await loadJob(ctx, job.id))!;
    expect(view.flags.filter(item => item.status === 'open' && item.checkCode === 'weight_mismatch')).toEqual([]);
    expect(view.activity.some(entry => entry.action === 'field.corrected')).toBe(true);
    // Personal streak counts only the person's own events; team totals carry no names.
    expect((await myStats(ctx)).errors).toBe(1);
    expect((await teamStats(ctx)).every(row => !('userId' in row))).toBe(true);
    // Search by reference, party or text, with version history.
    const found = await searchDocuments(ctx, '176-12345675');
    expect(found.map(item => item.id)).toEqual(expect.arrayContaining([invoice.id, packing.id]));
    expect(found[0].versions).toHaveLength(1);
  });

  it('remembers an accepted difference for the client', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: USER, role: 'owner', demo: false } };
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-7002', clientName: 'Client X' });
    const intake = await receiveIntake(ctx, { channel: 'upload', attachments: [photo('a.jpg'), photo('b.jpg')] });
    for (const document of intake.documents) await ctx.repo.update('ophanim_documents', ORG, { id: document.id }, { jobFileId: job.id });
    await processDocument(ctx, intake.documents[0].id, read('commercial_invoice', '500'));
    await processDocument(ctx, intake.documents[1].id, read('packing_list', '520'));
    const flag = (await loadJob(ctx, job.id))!.flags.find(item => item.checkCode === 'weight_mismatch')!;
    await resolveFlag(ctx, job.id, flag.id, 'accepted_difference');
    const other = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-7003', clientName: 'Client X' });
    const second = await receiveIntake(ctx, { channel: 'upload', attachments: [photo('c.jpg'), photo('d.jpg')] });
    for (const document of second.documents) await ctx.repo.update('ophanim_documents', ORG, { id: document.id }, { jobFileId: other.id });
    await processDocument(ctx, second.documents[0].id, read('commercial_invoice', '500'));
    await processDocument(ctx, second.documents[1].id, read('packing_list', '520'));
    expect((await loadJob(ctx, other.id))!.flags.filter(item => item.checkCode === 'weight_mismatch')).toEqual([]);
  });
});

describe('document readers', () => {
  it('parses vision JSON strictly and drops unknown fields', () => {
    const parsed = parseVisionJson('```json\n{"doc_type":"packing_list","type_confidence":0.9,"fields":[{"field":"pieces","value":12,"confidence":0.98,"page":1,"bbox":{"x":0.1,"y":0.2,"w":0.1,"h":0.05}},{"field":"password","value":"x"}]}\n```');
    expect(parsed.docType).toBe('packing_list'); expect(parsed.fields).toEqual([{ field: 'pieces', value: '12', confidence: 0.98, page: 1, bbox: { x: 0.1, y: 0.2, w: 0.1, h: 0.05 } }]);
  });
  it('turns Tesseract TSV into lines with boxes and extracts fields', () => {
    const tsv = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext', '1\t1\t0\t0\t0\t0\t0\t0\t1000\t2000\t-1\t',
      '5\t1\t1\t1\t1\t1\t100\t400\t120\t30\t91\tGross', '5\t1\t1\t1\t1\t2\t230\t400\t110\t30\t90\tWeight:', '5\t1\t1\t1\t1\t3\t350\t400\t120\t30\t88\t1,249', '5\t1\t1\t1\t1\t4\t480\t400\t60\t30\t92\tKG'].join('\n');
    const lines = linesFromTsv(tsv);
    expect(lines[0].text).toBe('Gross Weight: 1,249 KG'); expect(lines[0].bbox).toMatchObject({ x: 0.1, y: 0.2 });
    expect(extractFromLines(lines, 0.75)[0]).toMatchObject({ field: 'gross_weight_kg', value: '1249' });
  });
  it('falls back to text, and to typing when nothing is configured', async () => {
    const text = await textReader.read({ bytes: Buffer.from(''), mimeType: 'text/plain', text: 'COMMERCIAL INVOICE\nInvoice No: INV-1\nTotal Pieces: 12\nGross Weight: 1240 KG\nCurrency: USD\nWidgets 10 PCS 5.00 50.00' });
    expect(text.docType).toBe('commercial_invoice'); expect(text.fields.find(field => field.field === 'pieces')?.value).toBe('12'); expect(text.lines).toHaveLength(1);
    const none = await readDocument({ bytes: Buffer.from('x'), mimeType: 'image/jpeg' }, []);
    expect(none.reader).toBe('none'); expect(none.note).toMatch(/type the values/);
  });
  it('only auto-accepts values that pass deterministic checks; Tired-Hands triggers', () => {
    expect(fieldPassesChecks('awb_number', '176-12345675')).toBe(true); expect(fieldPassesChecks('awb_number', '176-12345676')).toBe(false); expect(fieldPassesChecks('pieces', '12.5')).toBe(false);
    const at = Date.parse('2026-10-21T18:30:00Z'); // 22:30 in Dubai
    expect(tiredHands([], at)).toEqual(['late in the shift']);
    const burst = Array.from({ length: 16 }, (_, index) => ({ userId: 'u', documentType: 'x', processStep: 'verify', checkCode: null, isError: false, createdAt: new Date(Date.parse('2026-10-21T08:00:00Z') - index * 60e3).toISOString() }));
    expect(tiredHands(burst, Date.parse('2026-10-21T08:05:00Z'))).toEqual(['16 files in the last hour']);
  });
});
