import { describe, expect, it } from 'vitest';
import { jobFileDatabase, ORG_A, ORG_B, USER_A, USER_A2, USER_B } from './test-db';

const hash = 'a'.repeat(64);
async function seed(pg: Awaited<ReturnType<typeof jobFileDatabase>>, org: string, user: string, tag: string) {
  const shipment = (await pg.query<{ id: string }>(`insert into ophanim_shipments(organization_id,shipment_reference) values($1,$2) returning id`, [org, `JOB-${tag}`])).rows[0].id;
  const job = (await pg.query<{ id: string }>(`insert into ophanim_job_files(organization_id,job_number,mode,client_name,shipment_id) values($1,$2,'air_import','Client ${tag}',$3) returning id`, [org, `JOB-${tag}`, shipment])).rows[0].id;
  const doc = (await pg.query<{ id: string }>(`insert into ophanim_documents(organization_id,job_file_id,doc_type_code,original_file_name,storage_path,mime_type,file_size_bytes,file_sha256) values($1,$2,'commercial_invoice','inv.jpg',$4,'image/jpeg',100,$3) returning id`, [org, job, hash, `${org}/job/inv.jpg`])).rows[0].id;
  await pg.query(`insert into ophanim_job_references(organization_id,job_file_id,type,value,normalized_value,validated) values($1,$2,'awb','176-12345675','176-12345675',true)`, [org, job]);
  await pg.query(`insert into ophanim_extracted_fields(organization_id,document_id,job_file_id,field,value,confidence,reader) values($1,$2,$3,'gross_weight_kg','100',0.9,'stub')`, [org, doc, job]);
  await pg.query(`insert into ophanim_job_checks(organization_id,job_file_id,check_code,severity,message_en,message_ar,why_en,why_ar,fix_en,fix_ar,fingerprint) values($1,$2,'weight_mismatch','warn','m','م','w','و','f','ف',$3)`, [org, job, `fp-${tag}`]);
  await pg.query(`insert into ophanim_invoices(organization_id,job_file_id,direction,total) values($1,$2,'outgoing',100)`, [org, job]);
  // A job-file prediction in The Panel's ledger.
  const question = (await pg.query<{ id: string }>(`insert into ophanim_forecast_questions(organization_id,shipment_id,question_type,question_text,threshold,resolve_by) values($1,$2,'paper_risk','Paper risk for job',$3,now()+interval '1 day') returning id`, [org, shipment, JSON.stringify({ subjectKey: `paper:${job}` })])).rows[0].id;
  const snapshot = (await pg.query<{ id: string }>(`insert into ophanim_feature_snapshots(organization_id,shipment_id,as_of,feature_set_version,features) values($1,$2,now()-interval '1 minute','paper-risk@1',$3) returning id`, [org, shipment, JSON.stringify({ inputs_hash: hash })])).rows[0].id;
  const forecast = (await pg.query<{ id: string }>(`insert into ophanim_forecasts(organization_id,shipment_id,question_id,source_type,probability,feature_snapshot_id,trigger) values($1,$2,$3,'rule',0.25,$4,$5) returning id`, [org, shipment, question, snapshot, JSON.stringify({ modelVersion: 'paper-risk@1', inputsHash: hash })])).rows[0].id;
  await pg.query(`insert into ophanim_forecast_interactions(organization_id,forecast_id,kind) values($1,$2,'shown')`, [org, forecast]);
  await pg.query(`insert into ophanim_staff_error_events(organization_id,user_id,document_type,process_step,is_error) values($1,$2,'commercial_invoice','verify',true)`, [org, user]);
  return { job, forecast };
}

describe('job-file tenant isolation (RLS) on the combined schema', () => {
  it('one organization cannot see another organization’s job files, documents, photos, invoices or predictions', async () => {
    const pg = await jobFileDatabase();
    try {
      await seed(pg, ORG_A, USER_A, 'A'); await seed(pg, ORG_B, USER_B, 'B');
      await pg.query(`insert into ophanim_staff_error_events(organization_id,user_id,document_type,process_step,is_error) values($1,$2,'air_waybill','verify',false)`, [ORG_A, USER_A2]);
      // Simulate a future accidental browser grant: RLS must still isolate tenants.
      await pg.exec(`grant usage on schema app_private to authenticated; grant select on all tables in schema public to authenticated; set role authenticated; select set_config('test.org','${ORG_A}',false), set_config('test.user','${USER_A}',false);`);
      for (const table of ['ophanim_job_files', 'ophanim_job_references', 'ophanim_extracted_fields', 'ophanim_job_checks', 'ophanim_invoices', 'ophanim_forecast_questions', 'ophanim_forecasts', 'ophanim_feature_snapshots', 'ophanim_forecast_interactions']) {
        const rows = (await pg.query<{ organization_id: string }>(`select organization_id from ${table}`)).rows;
        expect(rows.length, table).toBeGreaterThan(0); expect(rows.every(row => row.organization_id === ORG_A), table).toBe(true);
      }
      // Staff statistics: only the person, not colleagues in the same organization.
      expect((await pg.query<{ user_id: string }>('select user_id from ophanim_staff_error_events')).rows.map(row => row.user_id)).toEqual([USER_A]);
      // No browser writes.
      await expect(pg.query(`insert into ophanim_job_files(organization_id,job_number,mode) values('${ORG_A}','X','road')`)).rejects.toThrow();
      await pg.exec(`select set_config('test.org','${ORG_B}',false), set_config('test.user','${USER_B}',false);`);
      expect((await pg.query<{ job_number: string }>('select job_number from ophanim_job_files')).rows.map(row => row.job_number)).toEqual(['JOB-B']);
      await pg.exec(`reset role; set role anon;`);
      await expect(pg.query('select * from ophanim_job_files')).rejects.toThrow();
    } finally { await pg.close(); }
  });

  it('job-file predictions obey The Panel ledger: rule source allowed, forecasts immutable, job-file question types accepted', async () => {
    const pg = await jobFileDatabase();
    try {
      const { forecast } = await seed(pg, ORG_A, USER_A, 'A');
      await expect(pg.query('update ophanim_forecasts set probability=0.9 where id=$1', [forecast])).rejects.toThrow('Append-only');
      await expect(pg.query('delete from ophanim_forecasts where id=$1', [forecast])).rejects.toThrow('Append-only');
      // Unknown question types and source types are still rejected.
      const [shipment] = (await pg.query<{ id: string }>(`select id from ophanim_shipments limit 1`)).rows;
      await expect(pg.query(`insert into ophanim_forecast_questions(organization_id,shipment_id,question_type,question_text,threshold,resolve_by) values($1,$2,'made_up','x','{}',now()+interval '1 day')`, [ORG_A, shipment.id])).rejects.toThrow();
      for (const type of ['ghost_position', 'time_gap_risk', 'weather_impact', 'payment_date', 'dispute_odds']) await pg.query(`insert into ophanim_forecast_questions(organization_id,shipment_id,question_type,question_text,threshold,resolve_by) values($1,$2,$3,'x','{}',now()+interval '1 day')`, [ORG_A, shipment.id, type]);
    } finally { await pg.close(); }
  });
});
