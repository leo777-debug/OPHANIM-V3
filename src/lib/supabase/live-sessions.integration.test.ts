import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ client: null as unknown, pool: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => fixture.client }));
vi.mock('@/lib/watchlists/db', () => ({ db: () => fixture.pool }));
import { getAuthenticatedActor } from '@/lib/auth/actor';

// Opt-in only: real Auth HTTP, real SDK, real PostgreSQL. No Auth/network mocks.
// The factory mock supplies the real client's in-memory session instead of Next cookies.
describe.skipIf(process.env.RUN_LOCAL_SUPABASE_SESSION_TESTS !== '1')('live local Supabase session lifecycle', () => {
  let client: SupabaseClient, pool: Pool;
  const organizationId = randomUUID(), otherOrganization = randomUUID(), userId = randomUUID();
  let authUserId: string | undefined;
  const request = (organization = organizationId) => new NextRequest('http://localhost/api/logistics/shipments', {
    headers: { cookie: `ophanim_organization=${organization}; ophanim_session=deliberately-invalid-legacy-cookie` },
  });
  beforeAll(async () => {
    const url = new URL(process.env.STRESS_SUPABASE_URL ?? '');
    const database = new URL(process.env.STRESS_SUPABASE_DATABASE_URL ?? '');
    for (const endpoint of [url, database]) {
      if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Live session tests permit a disposable loopback Supabase only.');
    }
    if (!process.env.STRESS_SUPABASE_PUBLISHABLE_KEY) throw new Error('Disposable local publishable key required.');
    pool = new Pool({ connectionString: database.href, max: 2 });
    fixture.pool = pool;
    client = createClient(url.href, process.env.STRESS_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
    });
    fixture.client = client;
    const { data, error } = await client.auth.signUp({ email: `stress-${userId}@example.test`, password: `Synthetic-${randomUUID()}-only` });
    if (error || !data.user || !data.session) throw new Error('Local Auth signup requires email auto-confirm and a disposable migrated Ophanim database.');
    authUserId = data.user.id;
    await pool.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3),($4,$5,$6)', [organizationId, 'DEMO ONLY live Auth A', `auth-${organizationId}`, otherOrganization, 'DEMO ONLY live Auth B', `auth-${otherOrganization}`]);
    await pool.query('insert into ophanim_users(id,auth_user_id,email) values($1,$2,$3)', [userId, authUserId, `stress-${userId}@example.test`]);
    await pool.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'owner')", [organizationId, userId]);
  }, 30000);
  afterAll(async () => {
    await client?.auth.signOut().catch(() => {});
    if (pool) {
      try {
        await pool.query('delete from ophanim_organization_memberships where user_id=$1', [userId]);
        await pool.query('delete from ophanim_users where id=$1', [userId]);
        await pool.query('delete from ophanim_organizations where id=any($1::uuid[])', [[organizationId, otherOrganization]]);
        if (authUserId) await pool.query('delete from auth.users where id=$1', [authUserId]);
      } finally { await pool.end(); }
    }
    fixture.client = null; fixture.pool = null;
  });
  it('validates the real signed session and current database membership', async () => {
    expect(await getAuthenticatedActor(request())).toMatchObject({ userId, organizationId, role: 'owner', authProvider: 'supabase' });
  });
  it('rejects a forged organization cookie despite a valid Auth session', async () => {
    expect(await getAuthenticatedActor(request(otherOrganization))).toBeNull();
  });
  it('observes role changes without waiting for JWT refresh', async () => {
    await pool.query("update ophanim_organization_memberships set role='viewer' where organization_id=$1 and user_id=$2", [organizationId,userId]);
    expect((await getAuthenticatedActor(request()))?.role).toBe('viewer');
  });
  it('refreshes the real session through Auth', async () => {
    const { data, error } = await client.auth.refreshSession();
    expect(error).toBeNull(); expect(data.session).toBeTruthy();
    expect((await getAuthenticatedActor(request()))?.userId).toBe(userId);
  });
  it('rejects a still-signed access token immediately after Auth deletes its session', async () => {
    const { data } = await client.auth.getSession();
    const token = data.session!.access_token;
    const { error } = await client.auth.signOut(); expect(error).toBeNull();
    // Replay the original signed token through the actual SDK, never a mocked verdict.
    fixture.client = { auth: { getClaims: () => client.auth.getClaims(token) } };
    expect(await getAuthenticatedActor(request())).toBeNull();
    expect((await client.auth.refreshSession({ refresh_token: data.session!.refresh_token })).error).toBeTruthy();
  });
});
