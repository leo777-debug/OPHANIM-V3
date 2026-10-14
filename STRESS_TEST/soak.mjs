import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { withIsolatedApp } from './harness.mjs';

const seconds = Number(process.argv.find((value) => value.startsWith('--seconds='))?.split('=')[1] ?? 3600);
if (!Number.isFinite(seconds) || seconds < 60 || seconds > 7200) throw new Error('Use a bounded soak duration from 60 to 7200 seconds.');
await withIsolatedApp(async ({ base, root, app }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const headers = { Origin: base, Cookie: `ophanim_session=${demo.token}` };
  const body = new FormData(); body.set('importType', 'shipment'); body.set('file', new File(['Shipment Reference\n' + Array.from({ length: 5000 }, (_, i) => `SOAK-SYNTHETIC-${i}`).join('\n')], 'synthetic-soak.csv', { type: 'text/csv' }));
  const preview = await fetch(`${base}/api/imports/preview`, { method: 'POST', headers, body });
  if (!preview.ok) throw new Error('Could not prepare the real background import for soak testing.');
  const imported = (await preview.json()).import;
  const confirm = await fetch(`${base}/api/imports/${imported.id}/confirm`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
  if (!confirm.ok) throw new Error('Could not queue the real background import.');
  const samples = []; const start = performance.now();
  const memory = () => new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-Command', `Get-Process -Id ${app.pid} | Select-Object WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`], { windowsHide: true }, (error, stdout) => { try { resolve(error ? null : JSON.parse(stdout)); } catch { resolve(null); } }));
  while ((performance.now() - start) / 1000 < seconds) {
    const tick = performance.now();
    const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    const shipments = await fetch(`${base}/api/logistics/shipments?limit=25`, { headers, signal: AbortSignal.timeout(15000) }).catch(() => null);
    const worker = await fetch(`${base}/api/imports/cron`, { headers: { Authorization: 'Bearer synthetic-stress-import-cron' }, signal: AbortSignal.timeout(30000) }).catch(() => null);
    samples.push({ elapsedSeconds: Math.round((performance.now() - start) / 1000), health: health?.status ?? 0, shipments: shipments?.status ?? 0, worker: worker?.status ?? 0, memory: await memory() });
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/soak.json'), JSON.stringify({ startedAt: new Date(Date.now() - performance.now() + start).toISOString(), elapsedSeconds: Math.round((performance.now() - start) / 1000), requestedSeconds: seconds, finished: false, samples }, null, 2));
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 30000 - (performance.now() - tick))));
  }
  const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' }); await client.connect();
  try {
    const status = await client.query('select status,imported_rows,failed_rows from ophanim_imports where id=$1', [imported.id]);
    const queues = await client.query("select count(*)::integer as pending from ophanim_import_jobs where status in ('queued','running')");
    const report = { elapsedSeconds: Math.round((performance.now() - start) / 1000), requestedSeconds: seconds, finished: true, samples, import: status.rows[0], pendingJobs: queues.rows[0].pending,
      pass: samples.every((sample) => sample.health === 200 && sample.shipments === 200 && sample.worker === 200) && status.rows[0]?.status === 'completed' && status.rows[0]?.imported_rows === 5000 };
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/soak.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, samples: `${samples.length} memory/status samples` })); if (!report.pass) process.exitCode = 1;
  } finally { await client.end(); }
}, { native: true });
