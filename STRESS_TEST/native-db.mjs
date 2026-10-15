import { initdb, postgres, pg_ctl } from '@embedded-postgres/windows-x64';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { createServer } from 'node:net';
import { TEST_BOOTSTRAP_SQL } from '../src/lib/knowledge/isolated-db.test-helper.ts';
import { hashPassword } from '../src/lib/auth/passwords.ts';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', () => reject(new Error('Port 55432 is occupied; refusing to touch an unknown database.')));
  probe.listen(55432, '127.0.0.1', () => probe.close(resolve));
});
const directory = resolve(root, 'STRESS_TEST/runtime', `native-${randomUUID()}`);
if (!directory.startsWith(resolve(root, 'STRESS_TEST/runtime') + '\\')) throw new Error('Invalid isolated database directory.');
await mkdir(directory, { recursive: true });
async function command(exe, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = ''; child.stderr.on('data', (chunk) => { errors = (errors + chunk).slice(-4000); });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Disposable PostgreSQL command failed: ${errors}`)));
  });
}
await command(initdb, ['-D', directory, '--auth=trust', '--username=postgres', '--encoding=UTF8', '--locale=C']);
let server = spawn(postgres, ['-D', directory, '-h', '127.0.0.1', '-p', '55432', '-c', 'max_connections=100'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
server.stderr.on('data', () => {});
const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
let stopped = false;
async function stop() {
  if (stopped) return; stopped = true;
  await client.end().catch(() => {});
  await command(pg_ctl, ['-D', directory, 'stop', '-m', 'immediate', '-w']).catch(() => { server.kill(); });
}
process.once('SIGINT', () => void stop().then(() => process.exit(0)));
process.once('SIGTERM', () => void stop().then(() => process.exit(0)));
process.on('message', (message) => {
  if (message === 'stop') void stop().then(() => process.exit(0));
  if (message === 'restart') void (async () => {
    await command(pg_ctl, ['-D', directory, 'stop', '-m', 'immediate', '-w']);
    server = spawn(postgres, ['-D', directory, '-h', '127.0.0.1', '-p', '55432'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    server.stderr.on('data', () => {});
    for (let i = 0; i < 100; i++) {
      const probe = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
      try { await probe.connect(); await probe.query('select 1'); await probe.end(); process.send?.({ event: 'restarted' }); return; }
      catch { await probe.end().catch(() => {}); await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    process.send?.({ event: 'restart-failed' });
  })().catch(() => process.send?.({ event: 'restart-failed' }));
});
try {
  for (let attempt = 0; ; attempt++) {
    const probe = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
    try { await probe.connect(); await probe.end(); break; }
    catch { await probe.end().catch(() => {}); if (attempt > 100) throw new Error('Native PostgreSQL startup timed out.'); await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await client.connect(); await client.query(TEST_BOOTSTRAP_SQL);
  const applied = [], unavailable = [];
  for (const folder of ['db/migrations', 'supabase/migrations']) {
    for (const name of (await readdir(folder)).filter((name) => name.endsWith('.sql')).sort()) {
      // This Windows distribution has no pgvector extension. Never substitute
      // another type or pretend to validate vector-backed Knowledge features.
      if (/knowledge/.test(name)) { unavailable.push(name); continue; }
      await client.query(`begin;\n${await readFile(resolve(folder, name), 'utf8')}\ncommit;`); applied.push(name);
    }
  }
  const org = randomUUID(), user = randomUUID(), token = 'synthetic-native-demo-session';
  await client.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3)', [org, 'DEMO ONLY - Ophanim Competition', 'competition-demo']);
  await client.query('insert into ophanim_users(id,email,display_name,password_hash) values($1,$2,$3,$4)', [user, 'presenter@example.test', 'Demo Presenter', await hashPassword('Synthetic-Demo-Only-2026')]);
  await client.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'owner')", [org, user]);
  await client.query("insert into ophanim_sessions(user_id,organization_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')", [user, org, createHash('sha256').update(token).digest('hex')]);
  if (process.argv.includes('--tenant-fixtures')) {
    const { seedTenantFixtures } = await import('./tenant-fixtures.mjs');
    const tenants = await seedTenantFixtures(client, { organizationId: org, userId: user, token }, { knowledge: false });
    await writeFile(resolve(root, 'STRESS_TEST/runtime/tenant-context.json'), JSON.stringify(tenants, null, 2));
  }
  if (process.argv.includes('--large')) {
    await client.query("insert into ophanim_shipments(organization_id,shipment_reference) select $1,'SYNTHETIC-' || n from generate_series(1,10000) n", [org]);
    await client.query("insert into ophanim_events(organization_id,event_type,title,summary) select $1,'weather','Synthetic event ' || n,'Synthetic scale test only' from generate_series(1,100000) n", [org]);
  }
  await writeFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), JSON.stringify({ organizationId: org, userId: user, token, database: 'native PostgreSQL 18 core; pgvector/Knowledge unavailable', applied, unavailable, directory }, null, 2));
  await client.end();
  console.log('Disposable PostgreSQL socket verified: native PostgreSQL 18 at 127.0.0.1:55432; no production database used.');
  if (process.argv.includes('--check')) await stop();
} catch (error) { await stop(); throw error; }
