import { beforeEach, describe, expect, it, vi } from 'vitest';
import { columnExists, isSchemaPendingError, resetSchemaCache, tableExists } from './schema-pending';

describe('schema pending detection', () => {
  it('recognises PostgreSQL missing-object codes and messages', () => {
    expect(isSchemaPendingError(Object.assign(new Error('x'), { code: '42703' }))).toBe(true);
    expect(isSchemaPendingError(new Error('column "historical" does not exist'))).toBe(true);
    expect(isSchemaPendingError(new Error('relation "ophanim_forecasts" does not exist'))).toBe(true);
    expect(isSchemaPendingError(new Error('role "ophanim_knowledge_app" does not exist'))).toBe(true);
    expect(isSchemaPendingError(new Error('column "x" of relation "y" does not exist'))).toBe(true);
  });
  it('leaves every other failure alone', () => {
    expect(isSchemaPendingError(new Error('Shipment reference is required.'))).toBe(false);
    expect(isSchemaPendingError(Object.assign(new Error('dup'), { code: '23505' }))).toBe(false);
    expect(isSchemaPendingError('relation "x" does not exist')).toBe(false);
    expect(isSchemaPendingError(null)).toBe(false);
  });
});

describe('schema capability checks', () => {
  beforeEach(() => resetSchemaCache());
  it('caches only objects that exist', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ found: false }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ found: true }] });
    expect(await tableExists({ query }, 'ophanim_forecasts')).toBe(false);
    expect(await tableExists({ query }, 'ophanim_forecasts')).toBe(true);
    expect(await tableExists({ query }, 'ophanim_forecasts')).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('checks columns in the public schema', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await columnExists({ query }, 'ophanim_shipments', 'historical')).toBe(false);
    expect(query.mock.calls[0][1]).toEqual(['ophanim_shipments', 'historical']);
  });
});
