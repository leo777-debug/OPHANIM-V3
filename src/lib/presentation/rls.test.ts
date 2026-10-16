import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

describe('actual presentation migration and database RLS',()=>{
  let pg:PGlite;
  beforeAll(async()=>{
    pg=new PGlite();
    await pg.exec(`create role anon;create role authenticated; create table ophanim_users(id uuid primary key);create table ophanim_organizations(id uuid primary key);`);
    await pg.exec(await readFile('supabase/migrations/20261016010656_presentation_mode.sql','utf8'));
    await pg.exec(await readFile('supabase/migrations/20261016120627_presentation_public_layers.sql','utf8'));
  },60000);
  afterAll(async()=>{await pg.close();},30000);
  it('starts OFF without any founder configuration',async()=>{
    const result=await pg.query<{presentation_mode:boolean}>('select presentation_mode from ophanim_presentation_settings');
    expect(result.rows[0].presentation_mode).toBe(false);
  });
  it.each(['anon','authenticated'])('%s can read flags but cannot mutate them or read secrets',async role=>{
    await pg.exec(`set role ${role}`);
    try {
      expect((await pg.query('select * from ophanim_presentation_settings')).rows).toHaveLength(1);
      expect((await pg.query('select * from ophanim_presentation_snapshots')).rows).toHaveLength(0);
      for(const query of ["update ophanim_presentation_settings set presentation_mode=true", "insert into ophanim_presentation_snapshots values('news','{}',0,now())",'select * from ophanim_private.presentation_secrets','select * from ophanim_private.presentation_audit','select * from ophanim_private.presentation_view_grants'])await expect(pg.query(query)).rejects.toThrow(/permission denied/);
    }finally{await pg.exec('reset role');}
  });
  it('keeps PIN and view grants out of all public tables',async()=>{
    const columns=await pg.query<{column_name:string}>("select column_name from information_schema.columns where table_name='ophanim_presentation_settings'");
    expect(columns.rows.map(row=>row.column_name)).not.toContain('pin_hash');
    expect((await pg.query('select * from ophanim_private.presentation_secrets')).rows).toEqual([{id:1,pin_hash:null,pin_version:0}]);
  });
  it('has RLS enabled for every new table, including private audit and grants',async()=>{
    const result=await pg.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='ophanim_private' or c.relname like 'ophanim_presentation_%') and c.relkind='r'");
    expect(result.rows).toHaveLength(5);expect(result.rows.every(row=>row.relrowsecurity)).toBe(true);
  });
  it('allows new public feed snapshots without removing old rows or widening write permissions',async()=>{
    await pg.exec("insert into ophanim_presentation_snapshots values('news','{}',0,now()); insert into ophanim_presentation_snapshots values('cameras','{}',0,now())");
    expect((await pg.query('select feed_id from ophanim_presentation_snapshots order by feed_id')).rows).toEqual([{feed_id:'cameras'},{feed_id:'news'}]);
    await pg.exec('set role anon');
    try { await expect(pg.exec("insert into ophanim_presentation_snapshots values('ports','{}',0,now())")).rejects.toThrow(/permission denied/); }
    finally { await pg.exec('reset role'); await pg.exec('delete from ophanim_presentation_snapshots'); }
  });
});
