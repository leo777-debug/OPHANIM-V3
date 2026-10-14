import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: async () => ({ userId: 'synthetic-import-abuse-user', organizationId: 'synthetic-org', role: 'owner' }) }));
vi.mock('@/lib/imports/repository', () => ({ persistImportPreview: vi.fn() }));
import { POST } from './route';

it('changing the forwarded IP cannot reset the same user import budget', async () => {
  for (let i = 0; i < 20; i++) {
    const result = await POST(new NextRequest('http://localhost/api/imports/preview', { method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${i}` }, body: 'invalid multipart' }));
    expect(result.status).toBe(400);
  }
  const rejected = await POST(new NextRequest('http://localhost/api/imports/preview', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.99' }, body: 'invalid multipart' }));
  expect(rejected.status).toBe(429);
});
