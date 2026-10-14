import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Client } from 'pg';
import { createIsolatedClient } from '../src/lib/knowledge/isolated-db.test-helper.ts';
import { hashPassword } from '../src/lib/auth/passwords.ts';
import { seedTenantFixtures } from './tenant-fixtures.mjs';

process.chdir(resolve(import.meta.dirname, '..'));
const isolated = await createIsolatedClient();
const org = randomUUID(), user = randomUUID();
const password = 'Synthetic-Demo-Only-2026';
await isolated.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3)', [org, 'DEMO ONLY - Ophanim Competition', 'competition-demo']);
await isolated.query('insert into ophanim_users(id,email,display_name,password_hash) values($1,$2,$3,$4)', [user, 'presenter@example.test', 'Demo Presenter', await hashPassword(password)]);
await isolated.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'owner')", [org, user]);
const token = 'synthetic-local-demo-session-not-for-production';
await isolated.query("insert into ophanim_sessions(user_id,organization_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')", [user, org, createHash('sha256').update(token).digest('hex')]);
const tenants = process.argv.includes('--tenant-fixtures') ? await seedTenantFixtures(isolated, { organizationId: org, userId: user, token }) : undefined;
const server = new PGLiteSocketServer({ db: isolated.database, host: '127.0.0.1', port: 55432, maxConnections: 10, inspect: false, debug: false });
try {
  await server.start();
  const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await client.connect();
  const result = await client.query('select name from ophanim_organizations where id=$1', [org]);
  if (result.rows[0]?.name !== 'DEMO ONLY - Ophanim Competition') throw new Error('Local database probe failed.');
  await client.end();
  await mkdir('STRESS_TEST/runtime', { recursive: true });
  await writeFile('STRESS_TEST/runtime/demo-context.json', JSON.stringify({ organizationId: org, userId: user, token, email: 'presenter@example.test', password, database: 'embedded-postgresql-not-native-concurrency', replay: 'synthetic fixtures only' }, null, 2));
  if (tenants) await writeFile('STRESS_TEST/runtime/tenant-context.json', JSON.stringify(tenants, null, 2));
  console.log('Disposable PostgreSQL socket verified at 127.0.0.1:55432. Synthetic DEMO ONLY organization seeded.');
  console.log('This is embedded PostgreSQL with a socket multiplexer, not native PostgreSQL performance/concurrency certification.');
  if (process.argv.includes('--check')) { await server.stop(); await isolated.end(); }
  else {
    const stop = async () => { await server.stop(); await isolated.end(); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }
} catch (error) {
  await server.stop().catch(() => {}); await isolated.end();
  console.error(error instanceof Error ? error.message : 'Local database startup failed.');
  process.exitCode = 1;
}
