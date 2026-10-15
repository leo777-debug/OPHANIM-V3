import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./database', () => ({ knowledgeTransaction: vi.fn() }));
vi.mock('./storage', () => ({ storePrivateFile: vi.fn(), deletePrivateFile: vi.fn() }));
import { knowledgeTransaction } from './database';
import { listDocuments } from './documents';
const actor = { userId: 'synthetic-user', organizationId: 'synthetic-org', role: 'owner' as const };
const query = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(knowledgeTransaction).mockImplementation(async (_actor, work) => work({ query } as unknown as PoolClient));
});
describe('knowledge document pagination', () => {
  it('uses bounded SQL parameters and a continuation instead of silently truncating', async () => {
    query.mockResolvedValueOnce({ rows: Array.from({ length: 101 }, (_, i) => ({ id: String(i) })) }).mockResolvedValueOnce({ rows: [{ bytes: '1000' }] });
    const result = await listDocuments(actor, { limit: 100, offset: 500 });
    expect(result.documents).toHaveLength(100);
    expect(result.pagination).toEqual({ limit: 100, offset: 500, hasMore: true, nextOffset: 600 });
    expect(query.mock.calls[0][0]).toContain('limit $1 offset $2');
    expect(query.mock.calls[0][1]).toEqual([101, 500]);
  });
  it('ends pagination when fewer than one full page remains', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'last' }] }).mockResolvedValueOnce({ rows: [{ bytes: '10' }] });
    const result = await listDocuments(actor, { limit: 100, offset: 1000 });
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextOffset).toBeNull();
  });
  it.each([{ limit: 100000, offset: 0 }, { limit: 100, offset: -1 }, { limit: NaN, offset: 0 }])('rejects invalid page bounds before a database call: %j', async (page) => {
    await expect(listDocuments(actor, page)).rejects.toThrow();
    expect(knowledgeTransaction).not.toHaveBeenCalled();
  });
});
