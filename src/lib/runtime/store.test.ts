import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRuntimeScope, writeRuntimeValue, recordRuntimeFirstSeen } from './store';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/pool', () => ({ runtimeDb: () => ({ query }) }));
afterEach(() => vi.unstubAllEnvs());
describe('runtime metadata persistence', () => {
  it('survives independent reads and coalesces file writes without losing records', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ophanim-runtime-'));
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('OPHANIM_RUNTIME_DIR', root);
    try {
      await Promise.all(Array.from({ length: 12 }, (_, i) => writeRuntimeValue('health', `source-${i}`, { count: i })));
      const result = await readRuntimeScope<{ count: number }>('health');
      expect(result.storage).toBe('local-file'); expect(Object.keys(result.items)).toHaveLength(12);
      expect(result.items['source-5'].count).toBe(5);
      await Promise.all([
        recordRuntimeFirstSeen('seen', ['article-a', 'article-b'], '2026-10-20T10:00:00Z'),
        recordRuntimeFirstSeen('seen', ['article-a', 'article-c'], '2026-10-20T11:00:00Z'),
      ]);
      const observations = await readRuntimeScope<string>('seen');
      expect(observations.items).toEqual({ 'article-a': '2026-10-20T10:00:00.000Z', 'article-b': '2026-10-20T10:00:00.000Z', 'article-c': '2026-10-20T11:00:00.000Z' });
      await expect(writeRuntimeValue('../escape', 'id', {})).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('protects the runtime schema from browser roles and denies access even when table grants are attempted', async () => {
    const pg = new PGlite();
    try {
      await pg.exec('create role anon; create role authenticated;');
      await pg.exec(readFileSync('supabase/migrations/20261019180612_parity_runtime.sql', 'utf8'));
      vi.stubEnv('DATABASE_URL', 'test-only');
      query.mockImplementation((sql: string, parameters: unknown[]) => pg.query(sql, parameters));
      await recordRuntimeFirstSeen('observed', ['one', 'two'], '2026-10-20T12:00:00Z');
      await recordRuntimeFirstSeen('observed', ['one'], '2026-10-20T10:00:00Z');
      const first = await recordRuntimeFirstSeen('observed', ['one', 'two'], '2026-10-20T13:00:00Z');
      expect(first.storage).toBe('postgres');
      expect(first.items).toEqual({ one: '2026-10-20T10:00:00.000Z', two: '2026-10-20T12:00:00.000Z' });
      await pg.query("insert into ophanim_runtime.entries(scope,id,value) values('health','one','{}')");
      await pg.exec('grant usage on schema ophanim_runtime to authenticated; grant select,insert on ophanim_runtime.entries to authenticated; set role authenticated;');
      expect((await pg.query('select * from ophanim_runtime.entries')).rows).toEqual([]);
      await expect(pg.query("insert into ophanim_runtime.entries(scope,id,value) values('health','two','{}')")).rejects.toThrow();
      await pg.exec('reset role; set role anon;');
      await expect(pg.query('select * from ophanim_runtime.entries')).rejects.toThrow();
    } finally { await pg.close(); }
  });
  it('opens a storage circuit after failure instead of repeating slow database attempts for every news bucket', async () => {
    vi.stubEnv('DATABASE_URL', 'test-only'); query.mockReset(); query.mockRejectedValue(new Error('Unavailable'));
    const first = await recordRuntimeFirstSeen('outage', ['one'], '2026-10-20T10:00:00Z');
    const second = await recordRuntimeFirstSeen('outage', ['one', 'two'], '2026-10-20T11:00:00Z');
    expect(query).toHaveBeenCalledTimes(1); expect(first.storage).toBe('memory');
    expect(second.items.one).toBe('2026-10-20T10:00:00.000Z'); expect(second.warning).toContain('process-local');
  });
});
