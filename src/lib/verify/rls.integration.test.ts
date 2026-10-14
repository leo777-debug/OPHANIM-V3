import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Verify additive migration assertions', () => {
  it('enables RLS for every new organization table and limits access to creator membership', () => {
    const schema = readFileSync('db/migrations/024_verify.sql', 'utf8');
    const policy = readFileSync('supabase/migrations/20261009141447_verify_security.sql', 'utf8');
    for (const table of ['ophanim_verify_runs', 'ophanim_verify_shares']) expect(schema).toContain(`alter table public.${table} enable row level security`);
    expect(policy.match(/user_id = app_private.current_ophanim_user_id\(\)/g)).toHaveLength(2);
    expect(policy).not.toContain('grant select, insert');
    expect(policy).not.toContain('to anon\n'); expect(schema).toContain('foreign key (previous_id, organization_id, user_id)');
  });
});
describe.skipIf(!process.env.DATABASE_URL)('Verify live database/RLS (DATABASE_URL required)', () => {
  let isolated: Awaited<ReturnType<(typeof import('../knowledge/isolated-db.test-helper'))['createIsolatedClient']>> | undefined;
  beforeAll(async () => {
    if (process.env.OPHANIM_TEST_PGLITE === '1') isolated = await (await import('../knowledge/isolated-db.test-helper')).createIsolatedClient();
  }, 120000);
  afterAll(async () => { await isolated?.end(); });
  it('isolates organizations and users; denies anon and cross-tenant references', async () => {
    const client = isolated ?? new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
    const orgA = randomUUID(), orgB = randomUUID(), userA = randomUUID(), userB = randomUUID(), authA = randomUUID(), authB = randomUUID(), runA = randomUUID(), runB = randomUUID();
    try {
      await client.query('begin');
      await client.query('insert into auth.users (id,email) values ($1,$2),($3,$4)', [authA, `${authA}@example.test`, authB, `${authB}@example.test`]);
      await client.query('insert into ophanim_organizations (id,name,slug) values ($1,$2,$3),($4,$5,$6)', [orgA, 'Verify RLS A', `verify-${orgA}`, orgB, 'Verify RLS B', `verify-${orgB}`]);
      await client.query('insert into ophanim_users (id,auth_user_id,email) values ($1,$2,$3),($4,$5,$6)', [userA, authA, `${userA}@example.test`, userB, authB, `${userB}@example.test`]);
      await client.query("insert into ophanim_organization_memberships (organization_id,user_id,role) values ($1,$2,'analyst'),($3,$4,'analyst'),($1,$4,'viewer')", [orgA, userA, orgB, userB]);
      await client.query("insert into ophanim_verify_runs (id,organization_id,user_id,result,checked_at) values ($1,$2,$3,'{}',now()),($4,$5,$6,'{}',now())", [runA, orgA, userA, runB, orgB, userB]);
      await client.query("insert into ophanim_verify_shares (organization_id,user_id,run_id,token_hash,snapshot,expires_at) values ($1,$2,$3,$4,'{}',now()+interval '1 day'),($5,$6,$7,$8,'{}',now()+interval '1 day')", [orgA,userA,runA,randomUUID(),orgB,userB,runB,randomUUID()]);
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [authA]); await client.query('set local role authenticated');
      const visible = await client.query('select id from ophanim_verify_runs where id=any($1::uuid[])', [[runA, runB]]); expect(visible.rows.map((row) => row.id)).toEqual([runA]);
      expect((await client.query('select run_id from ophanim_verify_shares where run_id=any($1::uuid[])', [[runA,runB]])).rows.map((row) => row.run_id)).toEqual([runA]);
      await client.query('savepoint denied_write');
      await expect(client.query("insert into ophanim_verify_runs (id,organization_id,user_id,result,checked_at) values ($1,$2,$3,'{}',now())", [randomUUID(), orgB, userB])).rejects.toThrow();
      await client.query('rollback to savepoint denied_write');
      await client.query('reset role'); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [authB]); await client.query('set local role authenticated');
      expect((await client.query('select id from ophanim_verify_runs where id=$1', [runA])).rows).toHaveLength(0);
      expect((await client.query('select run_id from ophanim_verify_shares where run_id=$1', [runA])).rows).toHaveLength(0);
      await client.query('reset role'); await client.query('savepoint bad_reference');
      await expect(client.query("insert into ophanim_verify_runs (id,organization_id,user_id,previous_id,result,checked_at) values ($1,$2,$3,$4,'{}',now())", [randomUUID(), orgA, userA, runB])).rejects.toThrow();
      await client.query('rollback to savepoint bad_reference');
      const flags = await client.query("select relrowsecurity from pg_class where oid in ('ophanim_verify_runs'::regclass,'ophanim_verify_shares'::regclass)"); expect(flags.rows.every((row) => row.relrowsecurity)).toBe(true);
      expect((await client.query("select has_table_privilege('anon','ophanim_verify_runs','SELECT') as runs, has_table_privilege('anon','ophanim_verify_shares','SELECT') as shares")).rows[0]).toEqual({ runs: false, shares: false });
      expect((await client.query("select has_table_privilege('authenticated','ophanim_verify_runs','INSERT') as runs, has_table_privilege('authenticated','ophanim_verify_shares','INSERT') as shares")).rows[0]).toEqual({ runs: false, shares: false });
    } finally { await client.query('rollback'); await client.end(); }
  }, 30000);
});
