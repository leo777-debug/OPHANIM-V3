import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('vessel identifier corrective migration', () => {
  let database: PGlite;
  let migration: string;
  beforeAll(async () => {
    database = new PGlite();
    // Minimal copies of the four legacy checks; the correction itself is real SQL.
    await database.exec(String.raw`
      create table ophanim_shipments (
        imo_number text check (imo_number is null or imo_number ~ '^\\d{7}$'),
        mmsi_number text check (mmsi_number is null or mmsi_number ~ '^\\d{9}$')
      );
      create table ophanim_routes (
        imo_number text check (imo_number is null or imo_number ~ '^\\d{7}$'),
        mmsi_number text check (mmsi_number is null or mmsi_number ~ '^\\d{9}$')
      );
      alter table ophanim_shipments enable row level security;
      alter table ophanim_routes enable row level security;
    `);
    await expect(database.query('insert into ophanim_shipments(imo_number) values($1)', ['1234567'])).rejects.toMatchObject({ code: '23514' });
    migration = await readFile('db/migrations/028_vessel_identifier_constraints.sql', 'utf8');
    await database.exec(migration);
  }, 120000);
  afterAll(async () => { await database?.close(); });

  for (const table of ['ophanim_shipments', 'ophanim_routes']) {
    it(`${table} accepts numeric IMO/MMSI, leading zeros and absent identifiers`, async () => {
      for (const values of [['1234567', '123456789'], ['0000000', '000000000'], [null, null]]) {
        await expect(database.query(`insert into ${table}(imo_number,mmsi_number) values($1,$2) returning imo_number,mmsi_number`, values))
          .resolves.toMatchObject({ rows: [{ imo_number: values[0], mmsi_number: values[1] }] });
      }
    });
    it(`${table} still rejects wrong lengths, letters, whitespace and non-ASCII digits`, async () => {
      for (const [column, invalid] of [['imo_number', '123456'], ['imo_number', '12345678'], ['imo_number', 'abc1234'], ['imo_number', '1234567\n'], ['imo_number', '\uff11\uff12\uff13\uff14\uff15\uff16\uff17'], ['mmsi_number', '12345678'], ['mmsi_number', '1234567890'], ['mmsi_number', '12345678a']]) {
        await expect(database.query(`insert into ${table}(${column}) values($1)`, [invalid])).rejects.toMatchObject({ code: '23514' });
      }
    });
  }
  it('does not change RLS flags or delete records, including when reapplied', async () => {
    const before = await database.query('select count(*) as count from ophanim_shipments');
    await database.exec(migration);
    expect((await database.query('select count(*) as count from ophanim_shipments')).rows).toEqual(before.rows);
    const flags = await database.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('ophanim_shipments','ophanim_routes')");
    expect(flags.rows).toHaveLength(2);
    expect(flags.rows.every((row) => row.relrowsecurity)).toBe(true);
  });
});
