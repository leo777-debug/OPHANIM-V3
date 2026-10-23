import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./db', () => ({ db: () => ({ query: mocks.query }) }));
import { publicWatchlist, verifySubscription } from './service';

describe('public watchlist links', () => {
  beforeEach(() => vi.clearAllMocks());
  it('treats malformed link IDs as not found without querying uuid columns', async () => {
    expect(await publicWatchlist('abc')).toBeNull();
    expect(await verifySubscription('abc')).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('reports whether a confirmation link matched a subscription', async () => {
    const token = '0afb7dea-0fbd-4175-ac62-45c4d27afc3d';
    mocks.query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    expect(await verifySubscription(token)).toBe(true);
    expect(await verifySubscription(token)).toBe(false);
  });
});
