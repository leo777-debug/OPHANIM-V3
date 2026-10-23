import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { importIdFrom, isImportId } from './route-id';

const request = (path: string) => ({ nextUrl: new URL(`https://example.test${path}`) }) as unknown as NextRequest;

describe('import route ids', () => {
  it('accepts real v4 UUIDs (the old pattern rejected every one)', () => {
    expect(isImportId('bf138b13-5882-4715-b19e-4c10053cc9ff')).toBe(true);
    expect(isImportId('bf138b13-5882-4715-b19e4c10053cc9ff')).toBe(false);
    expect(isImportId('../etc/passwd')).toBe(false);
  });

  it('uses the param, then the URL path', async () => {
    const id = 'bf138b13-5882-4715-b19e-4c10053cc9ff';
    expect(await importIdFrom(request(`/api/imports/${id}/confirm`), Promise.resolve({ id }))).toBe(id);
    expect(await importIdFrom(request(`/api/imports/${id}/confirm`), Promise.resolve({}))).toBe(id);
    expect(await importIdFrom(request('/api/imports/nope/confirm'), Promise.resolve({ id: 'nope' }))).toBeNull();
  });
});
