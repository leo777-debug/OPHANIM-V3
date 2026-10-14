import { beforeEach, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/watchlists/db', () => ({ db: () => ({ query }) }));
import { listShipmentPage } from './shipments';
const actor = { userId: 'user-a', organizationId: 'org-a', role: 'owner' as const };
beforeEach(() => {
  vi.clearAllMocks();
  query.mockImplementation(async (sql: string) => sql.includes('count(*)') ? { rows: [{ total: 10000 }] } : { rows: [] });
});
it('bounds the default response while retaining total and continuation information', async () => {
  const result = await listShipmentPage(actor, new URLSearchParams());
  expect(result.page).toEqual({ limit: 100, offset: 0, total: 10000, hasMore: true });
  expect(query).toHaveBeenCalledWith(expect.stringContaining('limit $2 offset $3'), ['org-a', 100, 0]);
});
it.each(['limit=251', 'limit=0', 'offset=-1', 'offset=1.5', 'limit=NaN', 'sort=DROP TABLE'])('rejects invalid page %s before querying', async (input) => {
  await expect(listShipmentPage(actor, new URLSearchParams(input))).rejects.toThrow(); expect(query).not.toHaveBeenCalled();
});
it('keeps hostile search text in parameters, never SQL identifiers', async () => {
  const input = "'; DROP TABLE ophanim_shipments; --";
  await listShipmentPage(actor, new URLSearchParams({ query: input, carrier: 'Synthetic Carrier', offset: '100' }));
  for (const [sql, values] of query.mock.calls) {
    expect(sql).not.toContain('DROP TABLE'); expect(values[0]).toBe('org-a');
  }
  expect(query.mock.calls[0][1]).toEqual(['org-a', 'Synthetic Carrier', `%${input.replaceAll('_', '\\_')}%`, 100, 100]);
});
it('does not allow a viewer to choose a foreign organization through filters', async () => {
  await listShipmentPage({ ...actor, role: 'viewer' }, new URLSearchParams({ organizationId: 'org-b' }));
  expect(query.mock.calls.every(([, values]) => values[0] === 'org-a')).toBe(true);
});
