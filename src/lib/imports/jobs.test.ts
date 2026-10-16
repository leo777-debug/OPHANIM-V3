import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('@/lib/watchlists/db', () => ({ db: () => mocked }));
import { runImportJobs } from './jobs';

describe('background import job claim SQL', () => {
  let database: PGlite;
  beforeEach(async () => {
    database = new PGlite();
    await database.exec(`
      create table ophanim_imports (id text primary key, created_by_user_id text, organization_id text, import_type text);
      create table ophanim_import_jobs (
        id text primary key, import_id text, status text, attempts integer default 0,
        next_attempt_at timestamptz default now(), created_at timestamptz default now(),
        started_at timestamptz, updated_at timestamptz, completed_at timestamptz, last_error text
      );
    `);
    mocked.query.mockImplementation((sql, values) => database.query(sql, values));
    mocked.connect.mockResolvedValue({ query: mocked.query, release: vi.fn() });
  });
  afterEach(async () => { await database.close(); vi.clearAllMocks(); });

  it('executes the real UPDATE/FROM claim query when the queue is empty', async () => {
    await expect(runImportJobs(1)).resolves.toEqual({ processed: 0, completed: 0, failed: 0 });
  });

  it('claims a queued job and safely retries when its creator is unavailable', async () => {
    await database.exec(`insert into ophanim_imports values ('import-a', null, 'org-a', 'shipment');
      insert into ophanim_import_jobs (id, import_id, status) values ('job-a', 'import-a', 'queued');`);
    await expect(runImportJobs(1)).resolves.toEqual({ processed: 1, completed: 0, failed: 1 });
    const result = await database.query('select status, attempts, last_error from ophanim_import_jobs');
    expect(result.rows[0]).toEqual({ status: 'queued', attempts: 1, last_error: 'The import creator is no longer available.' });
  });
  it('never persists an arbitrary database exception in visible job errors',async()=>{
    await database.exec(`insert into ophanim_imports values ('import-a','synthetic-user','org-a','shipment'); insert into ophanim_import_jobs(id,import_id,status) values('job-a','import-a','queued');`);
    mocked.query.mockImplementation((sql,values)=>String(sql).includes('select role from')?Promise.reject(new Error('synthetic-private-database-credential')):database.query(sql,values));
    await expect(runImportJobs(1)).resolves.toEqual({processed:1,completed:0,failed:1});
    const row=(await database.query('select last_error from ophanim_import_jobs')).rows[0];
    expect(JSON.stringify(row)).not.toContain('synthetic-private');
  });
});
