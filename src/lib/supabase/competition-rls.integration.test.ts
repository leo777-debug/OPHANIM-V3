import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe.skipIf(!process.env.DATABASE_URL)('Competition database tenant boundary (isolated or DATABASE_URL)', () => {
  let isolated: Awaited<ReturnType<(typeof import('../knowledge/isolated-db.test-helper'))['createIsolatedClient']>> | undefined;
  beforeAll(async () => {
    if (process.env.OPHANIM_TEST_PGLITE === '1') isolated = await (await import('../knowledge/isolated-db.test-helper')).createIsolatedClient();
  }, 120000);
  afterAll(async () => { await isolated?.end(); });
  it('denies cross-organization reads, updates and deletes across core tables and file objects', async () => {
    const client = isolated ?? new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const a = randomUUID(), b = randomUUID(), ua = randomUUID(), ub = randomUUID(), authA = randomUUID(), authB = randomUUID();
    const rows: Array<{ table: string; a: string; b: string }> = [];
    const add = async (table: string, columns: string[], data: unknown[]) => {
      const ids = [randomUUID(), randomUUID()];
      for (let n = 0; n < 2; n++) {
        const values = [ids[n], n ? b : a, ...data];
        // Identifiers below are fixed test-owned constants, never request input.
        await client.query(`insert into ${table}(id,organization_id,${columns.join(',')}) values(${values.map((_, i) => `$${i + 1}`).join(',')})`, values);
      }
      rows.push({ table, a: ids[0], b: ids[1] });
    };
    try {
      await client.query('begin');
      await client.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [authA, 'a@example.test', authB, 'b@example.test']);
      await client.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3),($4,$5,$6)', [a, 'DEMO ONLY Tenant A', `demo-${a}`, b, 'DEMO ONLY Tenant B', `demo-${b}`]);
      await client.query('insert into ophanim_users(id,auth_user_id,email) values($1,$2,$3),($4,$5,$6)', [ua, authA, `${ua}@example.test`, ub, authB, `${ub}@example.test`]);
      await client.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'owner'),($3,$4,'viewer')", [a, ua, b, ub]);
      await add('ophanim_shipments', ['shipment_reference'], ['DXB-291 synthetic']);
      await add('ophanim_imports', ['import_type', 'file_name', 'file_size_bytes', 'file_sha256', 'column_mapping'], ['shipment', 'synthetic.csv', 100, 'a'.repeat(64), '{}']);
      await add('ophanim_entities', ['entity_type', 'canonical_name', 'normalized_key'], ['port', 'Synthetic Port', 'synthetic-port']);
      await add('ophanim_events', ['event_type', 'title', 'summary'], ['weather', 'Synthetic weather', 'Synthetic replay only']);
      await add('ophanim_cases', ['title'], ['Synthetic case']);
      await add('ophanim_evidence', ['evidence_type', 'title'], ['manual', 'Synthetic evidence']);
      const objectA = `${a}/synthetic/file.txt`, objectB = `${b}/synthetic/file.txt`;
      await client.query("insert into storage.objects(bucket_id,name) values('ophanim-private',$1),('ophanim-private',$2)", [objectA, objectB]);
      const flags = await client.query("select relname,relrowsecurity from pg_class where relname=any($1::text[])", [rows.map((row) => row.table)]);
      expect(flags.rows).toHaveLength(rows.length);
      expect(flags.rows.every((row) => row.relrowsecurity === true)).toBe(true);

      for (const [auth, other] of [[authA, 'b'], [authB, 'a']] as const) {
        await client.query('reset role');
        await client.query("select set_config('request.jwt.claim.sub',$1,true)", [auth]);
        await client.query('set local role authenticated');
        for (const row of rows) {
          for (const statement of [
            `select id from ${row.table} where id=$1`,
            `update ${row.table} set organization_id=organization_id where id=$1 returning id`,
            `delete from ${row.table} where id=$1 returning id`,
          ]) {
            await client.query('savepoint boundary');
            try { expect((await client.query(statement, [row[other]])).rows).toHaveLength(0); }
            catch (error) {
              // Some platform tables are intentionally unavailable to the Data API.
              // A deny-all table is isolation evidence, not a functional API test.
              expect((error as { code?: string }).code).toBe('42501');
            } finally { await client.query('rollback to savepoint boundary'); }
          }
        }
        const otherObject = other === 'b' ? objectB : objectA;
        expect((await client.query('select name from storage.objects where name=$1', [otherObject])).rows).toHaveLength(0);
        expect((await client.query('delete from storage.objects where name=$1 returning name', [otherObject])).rows).toHaveLength(0);
      }
    } finally { await client.query('rollback'); if (!isolated) await client.end(); }
  }, 30000);
  it('enforces child-target ownership even for a service connection that bypasses RLS', async () => {
    const client = isolated ?? new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const a = randomUUID(), b = randomUUID(), ca = randomUUID(), cb = randomUUID(), evidence = randomUUID(), template = randomUUID();
    try {
      await client.query('begin');
      await client.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3),($4,$5,$6)', [a, 'DEMO ONLY Child A', `child-${a}`, b, 'DEMO ONLY Child B', `child-${b}`]);
      await client.query('insert into ophanim_cases(id,organization_id,title) values($1,$2,$3),($4,$5,$6)', [ca, a, 'Synthetic case A', cb, b, 'Synthetic case B']);
      await client.query("insert into ophanim_evidence(id,organization_id,evidence_type,title) values($1,$2,'manual','Synthetic evidence')", [evidence, a]);
      await client.query("insert into ophanim_evidence_links(evidence_id,resource_type,resource_id) values($1,'case',$2)", [evidence, ca]);
      await client.query('savepoint foreign_link');
      await expect(client.query("insert into ophanim_evidence_links(evidence_id,resource_type,resource_id) values($1,'case',$2)", [evidence, cb])).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint foreign_link');
      await expect(client.query("update ophanim_evidence_links set resource_id=$2 where evidence_id=$1", [evidence, cb])).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint foreign_link');
      await client.query("insert into ophanim_workflow_templates(id,organization_id,template_key,name) values($1,$2,'synthetic-template','Synthetic foreign template')", [template, b]);
      await expect(client.query('update ophanim_cases set workflow_template_id=$2 where id=$1', [ca, template])).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint foreign_link');
      expect((await client.query('select resource_id from ophanim_evidence_links where evidence_id=$1', [evidence])).rows[0].resource_id).toBe(ca);
    } finally { await client.query('rollback'); if (!isolated) await client.end(); }
  }, 30000);
});
