import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { processDocument } from './paper-desk';
import { approvePaper, draftPaper } from './papers';
import { buildPdf } from './pdf';
import { memoryRepo } from './repo';
import { createJobFile, receiveIntake } from './service';
import { getFile } from './storage';
import type { Ctx } from './types';

const ORG = '00000000-0000-4000-8000-0000000000d1';
const field = (name: string, value: string) => ({ field: name, value, confidence: 0.97, page: 1, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.03 } });

describe('papers from the job file', () => {
  it('writes a valid PDF', () => {
    const pdf = buildPdf([[{ kind: 'text', x: 40, y: 40, text: 'HOUSE AIR WAYBILL (draft)' }, { kind: 'box', x: 40, y: 60, w: 100, h: 20 }]]).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true); expect(pdf).toContain('HOUSE AIR WAYBILL \\(draft\\)'); expect(pdf.trim().endsWith('%%EOF')).toBe(true);
    const xref = Number(pdf.match(/startxref\n(\d+)/)![1]); expect(pdf.slice(xref, xref + 4)).toBe('xref');
  });

  it('drafts a house AWB with every field filled from the job file, versions it and needs approval', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: '00000000-0000-4000-8000-0000000000d2', role: 'owner', demo: true } };
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-8001', clientName: 'SYNTHETIC Gulf Star Trading', origin: 'SZX', destination: 'DXB', goodsDescription: 'LED panels', references: [{ type: 'awb', value: '176-12345675' }, { type: 'hawb', value: 'SZX44871' }] });
    const intake = await receiveIntake(ctx, { channel: 'photo', bodyText: 'AWB 176-12345675', attachments: [{ fileName: 'awb.jpg', mimeType: 'image/jpeg', bytes: Buffer.from('synthetic') }] });
    await processDocument(ctx, intake.documents[0].id, { reader: 'vision', docType: 'air_waybill', typeConfidence: 0.95, pages: 1, text: '', lines: [], fields: [
      field('shipper', 'SYNTHETIC Shenzhen Bright Electronics'), field('consignee', 'SYNTHETIC Gulf Star Trading LLC'), field('pieces', '12'), field('gross_weight_kg', '1240'), field('volume_cbm', '9.0'), field('flight', 'EK9881'),
    ] });
    const { paper, missing } = await draftPaper(ctx, job.id, 'house_awb');
    expect(missing).toEqual([]);
    expect(paper.data).toMatchObject({ hawb_number: 'SZX44871', awb_number: '176-12345675', shipper: 'SYNTHETIC Shenzhen Bright Electronics', pieces: '12', gross_weight_kg: '1240', chargeable_weight_kg: '1500', origin: 'SZX', destination: 'DXB', description: 'LED panels' });
    const pdf = (await getFile(paper.storagePath!, true)).toString('latin1');
    expect(pdf).toContain('176-12345675'); expect(pdf).toContain('DRAFT v1');
    expect((await draftPaper(ctx, job.id, 'house_awb')).paper.version).toBe(2);
    await expect(approvePaper({ ...ctx, actor: { ...ctx.actor, demo: false, role: 'analyst' } }, job.id, paper.id)).rejects.toThrow('owner or operations manager');
    expect((await approvePaper(ctx, job.id, paper.id)).paper.status).toBe('approved');
    await expect(draftPaper(ctx, job.id, 'client_invoice')).rejects.toThrow('Draft the client invoice first');
  });
});
