import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn(), verify: vi.fn() }));
vi.mock('@/lib/watchlists/db', () => ({ db: () => ({ connect: mocks.connect, query: mocks.query }) }));
vi.mock('@/lib/auth/passwords', () => ({ verifyPassword: mocks.verify }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { POST } from './route';

function request(email: string, headers: Record<string, string> = {}, organizationSlug = 'synthetic-demo') {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email, password: 'Synthetic-Not-A-Real-Password', organizationSlug }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSupabaseServerClient).mockResolvedValue(null);
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.verify.mockResolvedValue(false);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('login boundary and abuse budgets', () => {
  const foreignContexts: Record<string, string>[] = [
    { origin: 'https://foreign.example.test', 'x-forwarded-for': '192.0.2.101' },
    { 'sec-fetch-site': 'cross-site', 'x-forwarded-for': '192.0.2.102' },
  ];
  it.each(foreignContexts)('rejects explicit foreign browser context before credentials or database access: %j', async (headers) => {
    expect((await POST(request('foreign@example.test', headers))).status).toBe(403);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('preserves own-origin and non-browser invalid-credential responses', async () => {
    for (const origin of ['http://localhost', undefined]) {
      const response = await POST(request('own-origin@example.test', { 'x-forwarded-for': '192.0.2.103', ...(origin ? { origin } : {}) }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Invalid sign-in details.' });
    }
    expect(mocks.release).toHaveBeenCalledTimes(2);
  });

  it('allows the administrator canonical origin behind an internal request URL', async () => {
    vi.stubEnv('APP_URL', 'https://ophanim.example.test');
    expect((await POST(request('canonical@example.test', { origin: 'https://ophanim.example.test', 'x-forwarded-for': '192.0.2.104' }))).status).toBe(401);
  });

  it('limits one normalized account despite rotated forwarded IPs, email case and organization slug', async () => {
    for (let i = 0; i < 10; i++) {
      const email = i % 2 ? '  Rotate-Login@Example.Test  ' : 'rotate-login@example.test';
      expect((await POST(request(email, { 'x-forwarded-for': `198.51.100.${i + 1}` }, `org-${i}`))).status).toBe(401);
    }
    const limited = await POST(request('rotate-login@example.test', { 'x-forwarded-for': '198.51.100.99' }, 'another-org'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(mocks.query).toHaveBeenCalledTimes(10);
  });

  it('applies the account budget before calling configured Supabase too', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { signInWithPassword } } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    for (let i = 0; i < 11; i++) {
      const response = await POST(request('supabase-budget@example.test', { 'x-forwarded-for': `203.0.113.${i + 1}` }, `org-${i}`));
      expect(response.status).toBe(i < 10 ? 401 : 429);
    }
    expect(signInWithPassword).toHaveBeenCalledTimes(10);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('bounds the actual JSON body without trusting Content-Length', async () => {
    const response = await POST(new NextRequest('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1', 'x-forwarded-for': '192.0.2.105' },
      body: JSON.stringify({ email: 'large@example.test', password: 'x'.repeat(9000), organizationSlug: 'demo' }),
    }));
    expect(response.status).toBe(413);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('returns a safe validation response for null JSON instead of throwing', async () => {
    const response = await POST(new NextRequest('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'x-forwarded-for': '192.0.2.106' }, body: 'null',
    }));
    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('still limits one IP when the account names change', async () => {
    for (let i = 0; i < 11; i++) {
      const response = await POST(request(`ip-budget-${i}@example.test`, { 'x-forwarded-for': '192.0.2.107' }));
      expect(response.status).toBe(i < 10 ? 401 : 429);
    }
    expect(mocks.query).toHaveBeenCalledTimes(10);
  });

  it('expires account budgets instead of permanently locking an identity', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    for (let i = 0; i < 11; i++) {
      expect((await POST(request('cooldown@example.test', { 'x-forwarded-for': `198.51.100.${i + 120}` }))).status).toBe(i < 10 ? 401 : 429);
    }
    clock.mockReturnValue(1_060_001);
    expect((await POST(request('cooldown@example.test', { 'x-forwarded-for': '198.51.100.150' }))).status).toBe(401);
  });

  it('preserves successful legacy sign-in and production cookie protections', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.query.mockResolvedValueOnce({ rows: [{ user_id: 'fixture-user', organization_id: 'fixture-org', password_hash: 'synthetic-hash' }] });
    mocks.verify.mockResolvedValue(true);
    const response = await POST(request('valid-login@example.test', { origin: 'http://localhost', 'x-forwarded-for': '192.0.2.108' }));
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie.toLowerCase()).toContain('samesite=lax');
    }
    expect(mocks.query.mock.calls[1][0]).toContain('insert into ophanim_sessions');
    expect(mocks.query.mock.calls[1][1][2]).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(['{broken', '[]'])('rejects malformed/structurally invalid JSON safely: %s', async (body) => {
    const response = await POST(new NextRequest('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'x-forwarded-for': '192.0.2.109' }, body,
    }));
    expect(response.status).toBe(400);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
