import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';
import { brierScore, createForecast, listForecasts, parseForecast, resolveForecast } from './forecasts';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/pool', () => ({ db: () => ({ query }) }));
const organizationId = '00000000-0000-4000-8000-000000000001', otherOrg = '00000000-0000-4000-8000-000000000002', userId = '00000000-0000-4000-8000-000000000003';
const actor = { organizationId, userId, role: 'owner' as const };
const input = { question: 'Will this public route reopen before the horizon?', horizon: '2026-11-01T00:00:00Z', probability: 0.8, sourceUrl: 'https://example.com/official-notice', rationale: 'Analyst judgement from linked evidence.' };
describe('sourced forecast records', () => {
  it('requires prospective horizons, bounded probabilities and safe source links', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    expect(parseForecast(input, now).probability).toBe(0.8);
    expect(() => parseForecast({ ...input, horizon: '2026-10-01T00:00:00Z' }, now)).toThrow('future');
    expect(() => parseForecast({ ...input, probability: 80 }, now)).toThrow('Probability');
    expect(() => parseForecast({ ...input, sourceUrl: 'javascript:alert(1)' }, now)).toThrow('HTTPS');
    expect(() => parseForecast({ ...input, sourceUrl: 'https://key@example.com/' }, now)).toThrow('credentials');
  });
  it('computes binary Brier scores only from explicit outcomes', () => {
    expect(brierScore(0.8, true)).toBeCloseTo(0.04); expect(brierScore(0.8, false)).toBeCloseTo(0.64);
    expect(brierScore(1, true)).toBe(0); expect(brierScore(1, false)).toBe(1);
    expect(() => brierScore(NaN, true)).toThrow();
  });
  it('executes tenant predicates, immutable probabilities, horizon gating and RLS in PostgreSQL', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(`create role anon; create role authenticated; create schema app_private;
        create table ophanim_organizations(id uuid primary key); create table ophanim_users(id uuid primary key);
        create function app_private.is_organization_member(target uuid) returns boolean language sql stable as $$select target='${organizationId}'::uuid$$;
        insert into ophanim_organizations values('${organizationId}'),('${otherOrg}'); insert into ophanim_users values('${userId}');`);
      await pg.exec(readFileSync('supabase/migrations/20261020080311_parity_forecasts.sql', 'utf8'));
      query.mockImplementation((sql: string, parameters: unknown[]) => pg.query(sql, parameters));
      const future = new Date(Date.now() + 86400000).toISOString();
      const created = await createForecast(actor, { ...input, horizon: future, organizationId: otherOrg });
      expect(created.brierScore).toBeNull(); expect(await listForecasts({ ...actor, organizationId: otherOrg })).toEqual([]);
      await expect(resolveForecast(actor, { id: created.id, outcome: true, sourceUrl: input.sourceUrl })).rejects.toThrow('horizon');
      // Advance the fixture's horizon in SQL; public APIs expose no such mutation.
      await pg.query("update ophanim_forecasts set horizon=now()-interval '1 second' where id=$1", [created.id]);
      const resolved = await resolveForecast(actor, { id: created.id, outcome: true, sourceUrl: input.sourceUrl, probability: 0 });
      expect(resolved.probability).toBe(0.8); expect(resolved.brierScore).toBeCloseTo(0.04);
      await expect(resolveForecast(actor, { id: created.id, outcome: false, sourceUrl: input.sourceUrl })).rejects.toThrow('already resolved');
      await expect(resolveForecast({ ...actor, organizationId: otherOrg }, { id: created.id, outcome: true, sourceUrl: input.sourceUrl })).rejects.toThrow('unavailable');
      await expect(createForecast({ ...actor, role: 'viewer' }, input)).rejects.toThrow('authorized');
      await createForecast({ ...actor, organizationId: otherOrg }, { ...input, horizon: future });
      await pg.exec('grant usage on schema app_private to authenticated; grant select,insert,update on ophanim_forecasts to authenticated; set role authenticated;');
      expect((await pg.query('select id from ophanim_forecasts')).rows).toHaveLength(1);
      expect((await pg.query('update ophanim_forecasts set probability=0 returning id')).rows).toEqual([]);
      await expect(pg.query(`insert into ophanim_forecasts(organization_id,created_by,question,horizon,probability,source_url) values('${organizationId}','${userId}','Test public question?',now()+interval '1 day',0.5,'https://example.com')`)).rejects.toThrow();
      await pg.exec('reset role; set role anon;'); await expect(pg.query('select * from ophanim_forecasts')).rejects.toThrow();
    } finally { await pg.close(); }
  });
});
