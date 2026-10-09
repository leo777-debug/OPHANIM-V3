import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/actor', () => ({ getAuthenticatedActor: vi.fn(async () => null) }));
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { NextRequest } from 'next/server';
import { readBody, requestContext } from './http';
describe('Verify input and abuse limits', () => {
  it('rejects oversized and non-JSON bodies', async () => {
    await expect(readBody(new Request('https://example.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'a'.repeat(17000) }) }))).rejects.toThrow('large');
    await expect(readBody(new Request('https://example.com', { method: 'POST', body: 'x' }))).rejects.toThrow('JSON');
  });
  it('rejects cross-origin mutations', async () => {
    await expect(requestContext(new NextRequest('https://ophanim.test/api/verify/check', { headers: { origin: 'https://attacker.test' } }), true)).rejects.toThrow('Cross-origin');
  });
  it('enforces per-IP rate limits', async () => {
    const request = () => new NextRequest('https://ophanim.test/api/verify/check', { headers: { 'x-real-ip': '192.0.2.123' } });
    for (let n = 0; n < 10; n++) await requestContext(request(), true);
    await expect(requestContext(request(), true)).rejects.toThrow('Too many');
  });
  it('also enforces per-user limits across different IPs', async () => {
    vi.stubEnv('DATABASE_URL', 'test-only');
    vi.mocked(getAuthenticatedActor).mockResolvedValue({ userId: 'verify-rate-user', organizationId: 'org', role: 'analyst', email: '', displayName: null, authProvider: 'supabase' });
    try {
      for (let n = 0; n < 20; n++) await requestContext(new NextRequest('https://ophanim.test/api/verify/check', { headers: { 'x-real-ip': `user-limit-${n}` } }), true);
      await expect(requestContext(new NextRequest('https://ophanim.test/api/verify/check', { headers: { 'x-real-ip': 'last-user-ip' } }), true)).rejects.toThrow('User check limit');
    } finally { vi.unstubAllEnvs(); vi.mocked(getAuthenticatedActor).mockResolvedValue(null); }
  });
});
