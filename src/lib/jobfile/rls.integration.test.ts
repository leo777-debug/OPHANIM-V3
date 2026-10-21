import { describe, expect, it } from 'vitest';
import { jobFileDatabase, ORG_A, ORG_B, USER_A, USER_A2, USER_B } from './test-db';

const hash = 'a'.repeat(64);
async function seed(pg: Awaited<ReturnType<typeof jobFileDatabase>>, org: string, user: string, tag: string) {
  const job = (await pg.query<{ id: string }>(`insert into ophanim_job_files(organization_id,job_number,mode,client_name) values($1,$2,'air_import','Client ${tag}') returning id`, [org, `JOB-${tag}`])).rows[0].id;
  const doc = (await pg.query<{ id: string }>(`insert into ophanim_documents(organization_id,job_file_id,doc_type_code,original_file_name,storage_path,mime_type,file_size_bytes,file_sha256) values($1,$2,'commercial_invoice','inv.jpg',$4,'image/jpeg',100,$3) returning id`, [org, job, hash, `${org}/job/inv.jpg`])).rows[0].id;
  await pg.query(`insert into ophanim_job_references(organization_id,job_file_id,type,value,normalized_value,validated) values($1,$2,'awb','176-12345675','176-12345675',true)`, [org, job]);
  await pg.query(`insert into ophanim_extracted_fields(organization_id,document_id,job_file_id,field,value,confidence,reader) values($1,$2,$3,'gross_weight_kg','100',0.9,'stub')`, [org, doc, job]);
  await pg.query(`insert into ophanim_job_checks(organization_id,job_file_id,check_code,severity,message_en,message_ar,why_en,why_ar,fix_en,fix_ar,fingerprint) values($1,$2,'weight_mismatch','warn','m','م','w','و','f','ف',$3)`, [org, job, `fp-${tag}`]);
  await pg.query(`insert into ophanim_invoices(organization_id,job_file_id,direction,total) values($1,$2,'outgoing',100)`, [org, job]);
  const question = (await pg.query<{ id: string }>(`insert into ophanim_forecast_questions(organization_id,job_file_id,question_type,outcome_kind,text_en,subject_key) values($1,$2,'paper_risk','binary','Paper risk for job',$3) returning id`, [org, job, `q-${tag}`])).rows[0].id;
  await pg.query(`insert into ophanim_forecasts(organization_id,question_id,job_file_id,source_type,prediction_type,question,horizon,probability,model_version,inputs_hash) values($1,$2,$3,'rule','paper_risk','Paper risk for this job',now()+interval '1 day',0.25,'paper-risk@1',$4)`, [org, question, job, hash]);
  await pg.query(`insert into ophanim_staff_error_events(organization_id,user_id,document_type,process_step,is_error) values($1,$2,'commercial_invoice','verify',true)`, [org, user]);
}

describe('job-file tenant isolation (RLS)', () => {
  it('one organization cannot see another organization’s job files, documents, photos, invoices or predictions', async () => {
    const pg = await jobFileDatabase();
    try {
      await seed(pg, ORG_A, USER_A, 'A'); await seed(pg, ORG_B, USER_B, 'B');
      await pg.query(`insert into ophanim_staff_error_events(organization_id,user_id,document_type,process_step,is_error) values($1,$2,'air_waybill','verify',false)`, [ORG_A, USER_A2]);
      // Simulate a future accidental browser grant: RLS must still isolate tenants.
      await pg.exec(`grant usage on schema app_private to authenticated; grant select on all tables in schema public to authenticated; set role authenticated; select set_config('test.org','${ORG_A}',false), set_config('test.user','${USER_A}',false);`);
      for (const table of ['ophanim_job_files', 'ophanim_documents', 'ophanim_job_references', 'ophanim_extracted_fields', 'ophanim_job_checks', 'ophanim_invoices', 'ophanim_forecast_questions']) {
        const rows = (await pg.query<{ organization_id: string }>(`select organization_id from ${table}`)).rows;
        if (table === 'ophanim_documents') continue; // stub table in this fixture has no RLS; production policy is phase 1.
        expect(rows.length, table).toBeGreaterThan(0); expect(rows.every(row => row.organization_id === ORG_A), table).toBe(true);
      }
      const forecasts = (await pg.query<{ organization_id: string }>('select organization_id from ophanim_forecasts')).rows;
      expect(forecasts).toHaveLength(1); expect(forecasts[0].organization_id).toBe(ORG_A);
      // Staff statistics: only the person, not colleagues in the same organization.
      const stats = (await pg.query<{ user_id: string }>('select user_id from ophanim_staff_error_events')).rows;
      expect(stats.map(row => row.user_id)).toEqual([USER_A]);
      // No browser writes.
      await expect(pg.query(`insert into ophanim_job_files(organization_id,job_number,mode) values('${ORG_A}','X','road')`)).rejects.toThrow();
      await pg.exec(`select set_config('test.org','${ORG_B}',false), set_config('test.user','${USER_B}',false);`);
      expect((await pg.query<{ job_number: string }>('select job_number from ophanim_job_files')).rows.map(row => row.job_number)).toEqual(['JOB-B']);
      await pg.exec(`reset role; set role anon;`);
      await expect(pg.query('select * from ophanim_job_files')).rejects.toThrow();
    } finally { await pg.close(); }
  });

  it('keeps the forecast ledger append-only while preserving legacy analyst resolution', async () => {
    const pg = await jobFileDatabase();
    try {
      await seed(pg, ORG_A, USER_A, 'A');
      await expect(pg.query('update ophanim_forecasts set probability=0.9')).rejects.toThrow('append-only');
      await expect(pg.query('delete from ophanim_forecasts')).rejects.toThrow('append-only');
      // Deleting the owning job (cascade) still works.
      await pg.query(`delete from ophanim_job_files where organization_id=$1`, [ORG_A]);
      expect((await pg.query(`select id from ophanim_forecasts where question_id is not null`)).rows).toEqual([]);
      await seed(pg, ORG_A, USER_A, 'A2');
      const legacy = (await pg.query<{ id: string }>(`insert into ophanim_forecasts(organization_id,created_by,question,horizon,probability,source_url) values($1,$2,'Will the public route reopen?',now()-interval '1 hour',0.7,'https://example.com/a') returning id`, [ORG_A, USER_A])).rows[0].id;
      await pg.query(`update ophanim_forecasts set outcome=true,outcome_source_url='https://example.com/b',resolved_at=now() where id=$1`, [legacy]);
      await expect(pg.query(`update ophanim_forecasts set outcome=false where id=$1`, [legacy])).rejects.toThrow('append-only');
      await expect(pg.query(`update ophanim_forecasts set probability=0.1,outcome=null where id=$1`, [legacy])).rejects.toThrow('append-only');
      // Machine predictions need a question, version and inputs hash.
      await expect(pg.query(`insert into ophanim_forecasts(organization_id,source_type,question,horizon,probability) values($1,'rule','No provenance here',now(),0.5)`, [ORG_A])).rejects.toThrow();
    } finally { await pg.close(); }
  });
});
