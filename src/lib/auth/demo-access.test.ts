import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import { hashSessionToken } from './session';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db/pool', () => ({ db: () => ({ query: mocks.query }) }));
import { presentationDemoActor } from './demo-access';

let pg: PGlite;
const organizationId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const token = 'synthetic-demo-session-fixture-0001';
const request = (path = '/api/logistics/shipments', signedIn = true) => new NextRequest(`https://demo.example${path}`, { headers: signedIn ? { Cookie: `ophanim_session=${token}` } : {} });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create table ophanim_users(id uuid primary key,external_subject text);
    create table ophanim_organizations(id uuid primary key,slug text);
    create table ophanim_organization_memberships(organization_id uuid,user_id uuid,role text);
    create table ophanim_presentation_settings(id integer,presentation_mode boolean);
    create table ophanim_sessions(user_id uuid,organization_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz);
    insert into ophanim_presentation_settings values(1,true);`);
  await pg.exec(await readFile('db/migrations/024_presentation_demo_access.sql', 'utf8'));
  mocks.query.mockImplementation((sql: string, parameters?: unknown[]) => pg.query(sql, parameters));
}, 60000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec(`delete from ophanim_private.presentation_demo_access; delete from ophanim_sessions;
    delete from ophanim_organization_memberships;delete from ophanim_users;delete from ophanim_organizations;
    update ophanim_presentation_settings set presentation_mode=true;
    insert into ophanim_organizations values('${organizationId}','ophanim-presentation-demo');
    insert into ophanim_users values('${userId}','ophanim-presentation-demo');
    insert into ophanim_organization_memberships values('${organizationId}','${userId}','owner');`);
  await pg.query("insert into ophanim_sessions values($1,$2,$3,null,now()+interval '1 hour')", [userId, organizationId, hashSessionToken(token)]);
});
const enable = () => pg.exec(`insert into ophanim_private.presentation_demo_access
  values(1,'${organizationId}','${userId}',true,now(),now()+interval '1 hour')`);

it('defaults to signed-out when demo access has not been explicitly enabled', async () => {
  expect(await presentationDemoActor(request())).toBeNull();
});
it('requires a real unrevoked session even when the labelled demo workspace is enabled', async () => {
  await enable();
  expect(await presentationDemoActor(request('/api/logistics/shipments', false))).toBeNull();
  const actor = await presentationDemoActor(request());
  expect(actor).toMatchObject({ organizationId, userId, authProvider: 'presentation-demo', role: 'owner' });
  expect(() => requireOrganizationAccess(actor!, 'another-organization', 'shipment:read')).toThrow();
  await pg.exec('update ophanim_sessions set revoked_at=now()');
  expect(await presentationDemoActor(request())).toBeNull();
});
it('automatically stops allowing access after expiry', async () => {
  await pg.exec(`insert into ophanim_private.presentation_demo_access
    values(1,'${organizationId}','${userId}',true,now()-interval '2 hours',now()-interval '1 hour')`);
  expect(await presentationDemoActor(request())).toBeNull();
});
it('requires Presentation mode to remain ON', async () => {
  await enable();
  await pg.exec('update ophanim_presentation_settings set presentation_mode=false');
  expect(await presentationDemoActor(request())).toBeNull();
});
it('rejects a real organization or user substituted into the demo configuration', async () => {
  await enable();
  await pg.exec("update ophanim_organizations set slug='real-customer'");
  expect(await presentationDemoActor(request())).toBeNull();
  await pg.exec("update ophanim_organizations set slug='ophanim-presentation-demo'; update ophanim_users set external_subject='real-user'");
  expect(await presentationDemoActor(request())).toBeNull();
});
it('cannot enable a grant lasting longer than one day', async () => {
  await expect(pg.exec(`insert into ophanim_private.presentation_demo_access
    values(1,'${organizationId}','${userId}',true,now(),now()+interval '2 days')`)).rejects.toThrow();
});
it.each(['/api/scanner','/api/sentinel','/api/sdk/ingest','/api/extension/context','/api/dark-web/scan','/api/ai/research'])
  ('never grants anonymous access to active integrations or scans: %s', async path => {
    await enable();
    expect(await presentationDemoActor(request(path))).toBeNull();
  });
it('fails closed when the database is unavailable', async () => {
  mocks.query.mockRejectedValueOnce(new Error('Unavailable'));
  expect(await presentationDemoActor(request())).toBeNull();
});
