import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { parseImportFile } from '@/lib/imports/file-parser';
import { buildDigest } from './digest';
import { buildCsv, buildXlsx, exportSheets } from './export';
import { memoryRepo } from './repo';
import { listJobs, loadJob } from './service';
import { detectChangedColumns, importTrackingSheet } from './sync';
import type { Ctx } from './types';

const ORG = '00000000-0000-4000-8000-0000000000f1';
const csv = (header: string) => Buffer.from(`Job No,Client,${header},ETA,Pieces,Gross Weight\nJF-3001,SYNTHETIC Client A,176-12345675,2026-10-24 06:00,12,1240\nJF-3002,SYNTHETIC Client B,157-11111110,2026-10-25,4,300\n`);

describe('connecting their software', () => {
  it('remembers a mapping per source and re-maps a renamed column on the second import', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true } };
    const first = await importTrackingSheet(ctx, { sourceKey: 'client-a', fileName: 'tracking.csv', mimeType: 'text/csv', bytes: csv('MAWB') });
    expect(first).toMatchObject({ rows: 2, created: 2, updated: 0, remapped: [] }); expect(first.mapping.awb).toBe('MAWB');
    const second = await importTrackingSheet(ctx, { sourceKey: 'client-a', fileName: 'tracking.csv', mimeType: 'text/csv', bytes: csv('Master Air Waybill No') });
    expect(second.remapped).toEqual([expect.objectContaining({ field: 'awb', from: 'MAWB', to: 'Master Air Waybill No' })]);
    expect(second).toMatchObject({ created: 0, updated: 2 });
    const jobs = await listJobs(ctx);
    expect(jobs).toHaveLength(2);
    const job = (await loadJob(ctx, jobs.find(item => item.jobNumber === 'JF-3001')!.id))!;
    expect(job.references.map(ref => ref.normalizedValue)).toContain('176-12345675');
    expect(job.pieces[0]).toMatchObject({ handoff: 'booked', pieces: 12, weightKg: 1240 });
    expect(job.job.plannedArrivalAt).toBe('2026-10-24T02:00:00.000Z');
  });

  it('uses value shape when names do not help', () => {
    const rows = [{ 'Col 7': '176-12345675' }, { 'Col 7': '157-11111110' }];
    expect(detectChangedColumns({ awb: 'MAWB' }, ['MAWB'], ['Col 7'], rows).remapped[0]).toMatchObject({ field: 'awb', to: 'Col 7' });
    expect(detectChangedColumns({ client: 'Client' }, ['Client'], ['Col 7'], rows).missing).toEqual(['client']);
  });

  it('exports a job file to xlsx that the importer reads back, and CSV without formulas', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true } };
    await importTrackingSheet(ctx, { sourceKey: 'client-a', fileName: 'tracking.csv', mimeType: 'text/csv', bytes: csv('MAWB') });
    const job = (await listJobs(ctx)).find(item => item.jobNumber === 'JF-3001')!;
    const xlsx = buildXlsx(await exportSheets(ctx, ['jobs'], job.id));
    const parsed = await parseImportFile('export.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx);
    expect(parsed.rows[0].slice(0, 3)).toEqual(['Job number', 'Mode', 'Status']);
    expect(parsed.rows[1][0]).toBe('JF-3001'); expect(parsed.rows[1][8]).toBe('176-12345675');
    expect(buildCsv({ name: 'x', rows: [['=HYPERLINK("x")', 1]] })).not.toMatch(/^=/);
    expect((await buildDigest(ctx)).subject).toContain('SYNTHETIC DEMO');
  });
});
