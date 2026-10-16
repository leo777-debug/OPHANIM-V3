import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/watchlists/db', () => ({ db: vi.fn(() => ({ query: vi.fn() })) }));
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/watchlists/db';
import { getAuthenticatedActor, requireAuthenticatedActor } from './actor';

describe('legacy sessions cannot bypass configured Supabase authentication', () => {
  const request = () => new NextRequest('http://localhost/api/logistics/shipments', { headers: { cookie: 'ophanim_session=synthetic-old-token' } });
  beforeEach(() => vi.clearAllMocks());
  it('rejects an invalid Supabase session rather than falling back to an old legacy cookie', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { getClaims: async () => ({ data: null, error: new Error('invalid-session') }) } } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'legacy-user', organization_id: 'legacy-org', role: 'owner', email: '', display_name: null }] });
    vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
    expect(await getAuthenticatedActor(request())).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects a valid Auth subject without an organization membership without legacy fallback', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { getClaims: async () => ({ data: { claims: { sub: '11111111-1111-4111-8111-111111111111', session_id: '22222222-2222-4222-8222-222222222222' } }, error: null }) } } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    const query = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
    expect(await getAuthenticatedActor(request())).toBeNull();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain('auth_user_id');
    expect(query.mock.calls[0][0]).toContain('auth.sessions');
    expect(query.mock.calls[0][1][2]).toBe('22222222-2222-4222-8222-222222222222');
  });
  it('rejects a signed subject without a session id before querying membership', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { getClaims: async () => ({ data: { claims: { sub: '11111111-1111-4111-8111-111111111111' } }, error: null }) } } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    const query = vi.fn();
    vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
    expect(await getAuthenticatedActor(request())).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it('preserves standalone legacy login with expiry, revocation and membership checks', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null);
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'fixture-user', organization_id: 'fixture-org', role: 'owner', email: '', display_name: null }] });
    vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
    expect((await getAuthenticatedActor(request()))?.authProvider).toBe('legacy');
    expect(query.mock.calls[0][0]).toContain('s.revoked_at is null and s.expires_at > now()');
    expect(query.mock.calls[0][0]).toContain('m.user_id = s.user_id');
    expect(query.mock.calls[0][1][0]).not.toBe('synthetic-old-token');
  });
});

describe('authenticated mutation origin boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null);
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: 'fixture-user', organization_id: 'fixture-org', role: 'owner', email: '', display_name: null }] });
    vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects a foreign Origin on %s even with a valid session', async (method) => {
    const request = new NextRequest('http://localhost/api/logistics/shipments', { method, headers: { cookie: 'ophanim_session=synthetic-old-token', Origin: 'https://attacker.example' } });
    await expect(requireAuthenticatedActor(request)).rejects.toThrow('Cross-origin');
  });
  it('preserves same-origin mutations and non-browser API clients', async () => {
    for (const origin of ['http://localhost', undefined]) {
      const headers = { cookie: 'ophanim_session=synthetic-old-token', ...(origin ? { Origin: origin } : {}) };
      expect((await requireAuthenticatedActor(new NextRequest('http://localhost/api/logistics/shipments', { method: 'POST', headers }))).userId).toBe('fixture-user');
    }
  });
});
