import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { memoryRepo, postgresRepo, type Repo } from './repo';
import { addReference, attachIntake, createJobFile, listIntake, loadJob, receiveIntake } from './service';
import { jobFileDatabase, ORG_A, ORG_B, USER_A } from './test-db';
import type { Ctx } from './types';

const preAlert = {
  channel: 'email' as const, externalId: 'msg-1@example.test', sender: 'agent@origin.example', subject: 'PRE-ALERT MAWB 176-12345675 / HAWB SZX44871',
  bodyText: 'Dear team, please find pre-alert for 12 pcs, 1240 kg, ETA DXB 24 Oct. Invoice No: INV-SZ-2026-118',
  attachments: [{ fileName: 'MAWB-176-12345675.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 synthetic'), text: 'AIR WAYBILL 176-12345675 NOT NEGOTIABLE' }],
};

async function scenario(repo: Repo, organizationId: string) {
  const ctx: Ctx = { repo, actor: { organizationId, userId: USER_A, role: 'owner', demo: true } };
  // An unmatched pre-alert with a valid AWB creates the job file.
  const created = await receiveIntake(ctx, preAlert);
  expect(created.createdJob).not.toBeNull(); expect(created.intake.status).toBe('created_job');
  const job = (await loadJob(ctx, created.createdJob!.id))!;
  expect(job.job.mode).toBe('air_import');
  expect(job.references.map(reference => `${reference.type}:${reference.normalizedValue}`)).toEqual(expect.arrayContaining(['awb:176-12345675', 'hawb:SZX44871', 'invoice:INV-SZ-2026-118']));
  expect(job.documents).toHaveLength(1); expect(job.documents[0].docTypeCode).toBe('air_waybill');
  // A second email for the same AWB updates the same job.
  const update = await receiveIntake(ctx, { ...preAlert, externalId: 'msg-2', subject: 'Re: MAWB 176-1234 5675 flight EK 9881', attachments: [] });
  expect(update.decision).toMatchObject({ status: 'matched', jobFileId: job.job.id });
  // Duplicate delivery of the same message is idempotent.
  expect((await receiveIntake(ctx, preAlert)).createdJob).toBeNull();
  // An invalid container number is flagged.
  const sea = await createJobFile(ctx, { mode: 'sea_import', jobNumber: 'JF-2001' });
  await addReference(ctx, sea.id, 'container', 'CSQU3054384', 'manual');
  const seaJob = (await loadJob(ctx, sea.id))!;
  expect(seaJob.references[0]).toMatchObject({ validated: false, validationCode: 'check_digit' });
  expect(seaJob.flags.map(flag => [flag.checkCode, flag.severity])).toEqual([['container_check_digit', 'block']]);
  // An ambiguous document lands in review.
  const other = await createJobFile(ctx, { mode: 'sea_import', jobNumber: 'JF-2002' });
  await addReference(ctx, sea.id, 'container', 'MSCU1234566', 'manual'); await addReference(ctx, other.id, 'container', 'MSCU1234566', 'manual');
  const ambiguous = await receiveIntake(ctx, { channel: 'whatsapp', bodyText: 'Gate in done MSCU 123456 6', attachments: [] });
  expect(ambiguous.decision.reason).toBe('ambiguous'); expect(ambiguous.intake.status).toBe('review');
  expect((await listIntake(ctx, 'review')).map(item => item.id)).toContain(ambiguous.intake.id);
  await attachIntake(ctx, ambiguous.intake.id, other.id);
  expect((await listIntake(ctx, 'review')).map(item => item.id)).not.toContain(ambiguous.intake.id);
  expect((await loadJob(ctx, job.job.id))!.activity.some(entry => entry.action === 'intake.received')).toBe(true);
  return ctx;
}

describe('job file intake and key ring', () => {
  it('works in demo mode (in-memory store)', async () => { await scenario(memoryRepo(), ORG_A); });
  it('works against PostgreSQL with tenant predicates', async () => {
    const pg = await jobFileDatabase();
    try {
      const repo = postgresRepo((sql, values) => pg.query(sql, values) as never);
      const ctx = await scenario(repo, ORG_A);
      const otherTenant: Ctx = { ...ctx, actor: { ...ctx.actor, organizationId: ORG_B } };
      expect(await listIntake(otherTenant)).toEqual([]);
      const [jobA] = (await pg.query<{ id: string }>(`select id from ophanim_job_files where organization_id=$1 limit 1`, [ORG_A])).rows;
      expect(await loadJob(otherTenant, jobA.id)).toBeNull();
    } finally { await pg.close(); }
  });
});
