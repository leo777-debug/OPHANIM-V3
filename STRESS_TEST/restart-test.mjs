import { Client } from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root, database }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const form = () => {
    const data = new FormData(); data.set('importType', 'shipment');
    data.set('file', new File(['Shipment Reference\n' + Array.from({ length: 5000 }, (_, i) => `RESTART-DEMO-${i}`).join('\n')], 'synthetic-restart.csv', { type: 'text/csv' })); return data;
  };
  const submit = () => fetch(`${base}/api/imports/preview`, { method: 'POST', body: form(), headers: { Origin: base, Cookie: `ophanim_session=${demo.token}` }, signal: AbortSignal.timeout(60000) });
  const probe = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  probe.on('error', () => {}); await probe.connect();
  const pending = submit().then(async (response) => ({ status: response.status, body: await response.json() })).catch(() => ({ status: 0 }));
  let observed = false;
  for (let i = 0; i < 500; i++) {
    const result = await probe.query("select 1 from pg_stat_activity where pid<>pg_backend_pid() and xact_start is not null and query ilike '%insert into ophanim_import_rows%' limit 1");
    if (result.rows.length) { observed = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await probe.end();
  if (!observed) throw new Error('Did not observe an actual import transaction; refusing to claim a restart test.');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Owned database restart timed out.')), 30000);
    const listener = (message) => { if (message.event === 'restarted') { clearTimeout(timer); database.off('message', listener); resolve(); } else if (message.event === 'restart-failed') { clearTimeout(timer); database.off('message', listener); reject(new Error('Owned database restart failed.')); } };
    database.on('message', listener); database.send('restart');
  });
  const interrupted = await pending;
  const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await client.connect();
  try {
    const before = await client.query('select count(*)::integer as count from ophanim_imports where organization_id=$1', [demo.organizationId]);
    const rows = await client.query('select count(*)::integer as count from ophanim_import_rows where organization_id=$1', [demo.organizationId]);
    const retry = await submit(); const result = await retry.json();
    const pass = interrupted.status !== 200 && before.rows[0].count === 0 && rows.rows[0].count === 0 && retry.ok && result.preview?.validRows === 5000;
    const report = { checkedAt: new Date().toISOString(), observedActiveImport: observed, interruptedStatus: interrupted.status, importsAfterCrash: before.rows[0].count, rowsAfterCrash: rows.rows[0].count, retryStatus: retry.status, retryValidRows: result.preview?.validRows, pass };
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/restart.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); if (!pass) process.exitCode = 1;
  } finally { await client.end(); }
}, { native: true });
