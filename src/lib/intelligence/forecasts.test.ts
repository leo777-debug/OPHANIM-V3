import { readFileSync } from 'node:fs';
import { jobFileDatabase, ORG_A, ORG_B, USER_A, USER_B } from '@/lib/jobfile/test-db';
import { describe, expect, it, vi } from 'vitest';
import { brierScore, createForecast, listForecasts, parseForecast, resolveForecast } from './forecasts';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/pool', () => ({ db: () => ({ query }) }));
const panelActor = { organizationId: ORG_A, userId: USER_A, role: 'owner' as const };
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
  it('stores analyst forecasts in The Panel ledger with tenant predicates, immutability, horizon gating and RLS', async () => {
    const pg = await jobFileDatabase();
    try {
      await pg.exec(readFileSync('supabase/migrations/20261022120000_analyst_forecasts_on_panel_ledger.sql', 'utf8'));
      query.mockImplementation((sql: string, parameters: unknown[]) => pg.query(sql, parameters));
      const created = await createForecast(panelActor, { ...input, horizon: new Date(Date.now() + 1500).toISOString(), organizationId: ORG_B });
      expect(created).toMatchObject({ probability: 0.8, sourceUrl: input.sourceUrl, rationale: input.rationale, brierScore: null });
      expect(await listForecasts({ ...panelActor, organizationId: ORG_B, userId: USER_B })).toEqual([]);
      await expect(resolveForecast(panelActor, { id: created.id, outcome: true, sourceUrl: input.sourceUrl })).rejects.toThrow('horizon');
      // Questions, forecasts and outcomes cannot be edited: no API or SQL path changes the probability.
      await expect(pg.query('update ophanim_forecasts set probability=0 where question_id=$1', [created.id])).rejects.toThrow('Append-only');
      await expect(pg.query("update ophanim_forecast_questions set resolve_by=now() where id=$1", [created.id])).rejects.toThrow('immutable');
      await new Promise(resolve => setTimeout(resolve, 1600));
      const resolved = await resolveForecast(panelActor, { id: created.id, outcome: true, sourceUrl: 'https://example.com/outcome', probability: 0 });
      expect(resolved).toMatchObject({ probability: 0.8, outcome: true, outcomeSourceUrl: 'https://example.com/outcome' }); expect(resolved.brierScore).toBeCloseTo(0.04);
      expect((await pg.query<{ brier: number }>('select brier from ophanim_forecast_scores')).rows[0].brier).toBeCloseTo(0.04);
      await expect(resolveForecast(panelActor, { id: created.id, outcome: false, sourceUrl: input.sourceUrl })).rejects.toThrow('already resolved');
      await expect(resolveForecast({ ...panelActor, organizationId: ORG_B, userId: USER_B }, { id: created.id, outcome: true, sourceUrl: input.sourceUrl })).rejects.toThrow('unavailable');
      await expect(createForecast({ ...panelActor, role: 'viewer' }, input)).rejects.toThrow('authorized');
      // Shipment-less rows are only allowed for public questions and human forecasts.
      await expect(pg.query(`insert into ophanim_forecast_questions(organization_id,shipment_id,question_type,question_text,threshold,resolve_by) values($1,null,'arrives_by','x','{}',now()+interval '1 day')`, [ORG_A])).rejects.toThrow();
      // RLS: another tenant's member sees nothing, even with a mistaken browser grant.
      await createForecast({ ...panelActor, organizationId: ORG_B, userId: USER_B }, { ...input, horizon: new Date(Date.now() + 86400000).toISOString() });
      await pg.exec(`grant usage on schema app_private to authenticated; grant select on all tables in schema public to authenticated; set role authenticated; select set_config('test.org','${ORG_A}',false);`);
      expect((await pg.query<{ organization_id: string }>(`select organization_id from ophanim_forecast_questions where question_type='public_question'`)).rows.map(row => row.organization_id)).toEqual([ORG_A]);
      await pg.exec('reset role; set role anon;'); await expect(pg.query('select * from ophanim_forecasts')).rejects.toThrow();
    } finally { await pg.close(); }
  });
});
