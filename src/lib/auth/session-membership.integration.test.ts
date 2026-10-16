import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createIsolatedClient } from '@/lib/knowledge/isolated-db.test-helper';

const fixture = vi.hoisted(() => ({ database: null as unknown, subject: '', session: '' }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/watchlists/db', () => ({ db: () => fixture.database }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: {
  getClaims: async () => ({ data: { claims: { sub: fixture.subject, session_id: fixture.session } }, error: null }),
} }) }));
import { getAuthenticatedActor } from './actor';

let database: Awaited<ReturnType<typeof createIsolatedClient>>;
const organization = randomUUID(), otherOrganization = randomUUID(), user = randomUUID(), otherSubject = randomUUID();
const request = (selected = organization) => new NextRequest('http://localhost/api/logistics/shipments', { headers: { cookie: `ophanim_organization=${selected}` } });
beforeAll(async () => {
  database = await createIsolatedClient(); fixture.database = database;
  fixture.subject = randomUUID(); fixture.session = randomUUID();
  // Auth owns this table in production. This disposable schema tests the real
  // membership SQL, not the remote Auth lifecycle or JWT verification.
  await database.query('create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz)');
  await database.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [fixture.subject,'a@example.test',otherSubject,'b@example.test']);
  await database.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3),($4,$5,$6)', [organization,'DEMO ONLY Auth A',organization,otherOrganization,'DEMO ONLY Auth B',otherOrganization]);
  await database.query('insert into ophanim_users(id,auth_user_id,email) values($1,$2,$3)', [user,fixture.subject,'a@example.test']);
  await database.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'owner')",[organization,user]);
  await database.query('insert into auth.sessions(id,user_id) values($1,$2)',[fixture.session,fixture.subject]);
}, 30000);
afterAll(async () => { await database?.end(); fixture.database = null; });
it('enforces active session ownership, expiry, membership freshness and revocation with actual PostgreSQL', async () => {
  expect(await getAuthenticatedActor(request())).toMatchObject({ userId:user, organizationId:organization, role:'owner' });
  expect(await getAuthenticatedActor(request(otherOrganization))).toBeNull();
  await database.query("update ophanim_organization_memberships set role='viewer' where user_id=$1",[user]);
  expect((await getAuthenticatedActor(request()))?.role).toBe('viewer');
  await database.query('update auth.sessions set user_id=$1 where id=$2',[otherSubject,fixture.session]);
  expect(await getAuthenticatedActor(request())).toBeNull();
  await database.query("update auth.sessions set user_id=$1,not_after=now()-interval '1 second' where id=$2",[fixture.subject,fixture.session]);
  expect(await getAuthenticatedActor(request())).toBeNull();
  await database.query('delete from auth.sessions where id=$1',[fixture.session]);
  expect(await getAuthenticatedActor(request())).toBeNull();
});
