import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), supabase: vi.fn() }));
vi.mock('@/lib/watchlists/db', () => ({ db: () => ({ connect: mocks.connect, query: mocks.query }) }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.supabase }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv('OPHANIM_REQUIRE_SIGN_IN', ''); vi.stubEnv('DATABASE_URL', '');
  mocks.supabase.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe('temporary no-sign-in workspace', () => {
  it('defaults to shared owner access in production, ignoring untrusted identity headers and cookies', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { getAuthenticatedActor, requireAuthenticatedActor } = await import('./actor');
    const { SHARED_ORGANIZATION_ID, SHARED_USER_ID } = await import('./shared-workspace');
    const request = new NextRequest('https://ophanim.example/api/auth/me', { headers: { cookie: 'ophanim_organization=other-org; ophanim_session=forged', 'x-organization-id': 'other-org' } });
    const actor = await getAuthenticatedActor(request);
    expect(actor).toMatchObject({ userId: SHARED_USER_ID, organizationId: SHARED_ORGANIZATION_ID, role: 'owner', authProvider: 'shared' });
    for (const permission of ['organization:manage', 'import:write', 'shipment:archive', 'rescue:write', 'cyber:write', 'research:run'] as const) expect(await requireAuthenticatedActor(request, permission)).toEqual(actor);
    expect(mocks.supabase).not.toHaveBeenCalled(); expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
    const { requireOrganizationAccess } = await import('@/lib/operations/authorization');
    expect(() => requireOrganizationAccess(actor!, 'another-org', 'shipment:read')).toThrow();
  });
  it('restores real authentication when explicitly enabled', async () => {
    vi.stubEnv('OPHANIM_REQUIRE_SIGN_IN', 'true');
    const { getAuthenticatedActor, requireAuthenticatedActor } = await import('./actor');
    const request = new NextRequest('https://ophanim.example/api/auth/me');
    expect(await getAuthenticatedActor(request)).toBeNull();
    await expect(requireAuthenticatedActor(request)).rejects.toThrow('Authentication is required.');
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.supabase).toHaveBeenCalled();
  });
  it('returns a real legacy membership in authenticated mode', async () => {
    vi.stubEnv('OPHANIM_REQUIRE_SIGN_IN', 'true');
    mocks.query.mockResolvedValue({ rows: [{ user_id: 'real-user', organization_id: 'real-org', role: 'analyst', email: 'analyst@example.com', display_name: 'Analyst' }] });
    const { getAuthenticatedActor } = await import('./actor');
    expect(await getAuthenticatedActor(new NextRequest('https://ophanim.example/', { headers: { cookie: 'ophanim_session=valid-token' } }))).toMatchObject({ userId: 'real-user', organizationId: 'real-org', role: 'analyst', authProvider: 'legacy' });
  });
  it('provisions real foreign-key identities once without altering an existing organization', async () => {
    vi.stubEnv('DATABASE_URL', 'fixture');
    const pg = new PGlite();
    try {
      await pg.exec(`create table ophanim_organizations(id uuid primary key, name text not null, slug text unique not null);
        create table ophanim_users(id uuid primary key, external_subject text unique, display_name text);
        create table ophanim_organization_memberships(organization_id uuid references ophanim_organizations(id), user_id uuid references ophanim_users(id), role text, primary key(organization_id,user_id));
        create table fixture_imports(id uuid primary key default gen_random_uuid(), organization_id uuid references ophanim_organizations(id), created_by uuid references ophanim_users(id));
        insert into ophanim_organizations values('00000000-0000-4000-8000-000000000001','Private customer','private-customer');`);
      const release = vi.fn();
      mocks.connect.mockResolvedValue({ query: (sql: string, values?: unknown[]) => pg.query(sql, values), release });
      const { getSharedWorkspaceActor } = await import('./shared-workspace');
      const actors = await Promise.all(Array.from({ length: 5 }, () => getSharedWorkspaceActor()));
      expect(mocks.connect).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
      expect(new Set(actors.map(actor => actor.organizationId)).size).toBe(1);
      await pg.query('insert into fixture_imports(organization_id,created_by) values($1,$2)', [actors[0].organizationId, actors[0].userId]);
      expect((await pg.query('select role from ophanim_organization_memberships')).rows).toEqual([{ role: 'owner' }]);
      expect((await pg.query("select name from ophanim_organizations where slug='private-customer'")).rows).toEqual([{ name: 'Private customer' }]);
      // Cold process / deployment: repeat the real SQL to verify idempotency.
      vi.resetModules();
      await (await import('./shared-workspace')).getSharedWorkspaceActor();
      expect((await pg.query('select count(*)::int as count from ophanim_users')).rows).toEqual([{ count: 1 }]);
    } finally { await pg.close(); }
  });
  it('rolls back failed provisioning and permits a later retry', async () => {
    vi.stubEnv('DATABASE_URL', 'fixture');
    const query = vi.fn().mockResolvedValue({ rows: [] });
    query.mockRejectedValueOnce(new Error('database temporarily unavailable'));
    const release = vi.fn(); mocks.connect.mockResolvedValue({ query, release });
    const { getSharedWorkspaceActor } = await import('./shared-workspace');
    await expect(getSharedWorkspaceActor()).rejects.toThrow('database temporarily unavailable');
    expect(query).toHaveBeenCalledWith('rollback'); expect(release).toHaveBeenCalledTimes(1);
    expect((await getSharedWorkspaceActor()).authProvider).toBe('shared');
    expect(query).toHaveBeenCalledWith('commit'); expect(release).toHaveBeenCalledTimes(2);
  });
});
