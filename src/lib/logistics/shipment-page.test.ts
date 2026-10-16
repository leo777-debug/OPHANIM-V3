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
it('coalesces identical simultaneous reads but never retains a completed result', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => listShipmentPage(actor, new URLSearchParams())));
  expect(query).toHaveBeenCalledTimes(3);
  expect(results.every(result => result.page.total === 10000)).toBe(true);
  await listShipmentPage(actor, new URLSearchParams());
  expect(query).toHaveBeenCalledTimes(6);
});
it('keeps concurrent organizations and filters separate', async () => {
  await Promise.all([
    listShipmentPage(actor, new URLSearchParams()),
    listShipmentPage({ ...actor, organizationId: 'org-b' }, new URLSearchParams()),
    listShipmentPage(actor, new URLSearchParams({ carrier: 'Other carrier' })),
  ]);
  expect(query).toHaveBeenCalledTimes(9);
  expect(query.mock.calls.filter(([,values]) => values[0] === 'org-b')).toHaveLength(3);
});
it('clears rejected reads so an outage does not poison later requests', async () => {
  query.mockRejectedValueOnce(new Error('synthetic database interruption'));
  await expect(listShipmentPage(actor, new URLSearchParams())).rejects.toThrow('interruption');
  await expect(listShipmentPage(actor, new URLSearchParams())).resolves.toMatchObject({ page: { total: 10000 } });
});
