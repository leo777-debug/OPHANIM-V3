import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/watchlists/db', () => ({ db: vi.fn(() => ({ query: vi.fn() })) }));
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/watchlists/db';
import { getAuthenticatedActor } from './actor';

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
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { getClaims: async () => ({ data: { claims: { sub: '11111111-1111-4111-8111-111111111111' } }, error: null }) } } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    const query = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(db).mockReturnValue({ query } as unknown as ReturnType<typeof db>);
    expect(await getAuthenticatedActor(request())).toBeNull();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain('auth_user_id');
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
