import { Client } from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const checks = await Promise.all(Array.from({ length: 20 }, async (_, batch) => {
    const csv = 'Shipment Reference,Carrier,Origin Port,Destination Port,ETA\n' + Array.from({ length: 5000 }, (_, row) => `SYNTHETIC-${batch}-${row},Synthetic Carrier,Jebel Ali,Nhava Sheva,2026-10-16T12:00:00Z`).join('\n');
    const body = new FormData(); body.set('importType', 'shipment'); body.set('file', new File([csv], `synthetic-${batch}.csv`, { type: 'text/csv' }));
    const start = performance.now();
    try {
      const response = await fetch(`${base}/api/imports/preview`, { method: 'POST', body, headers: { Origin: base, Cookie: `ophanim_session=${demo.token}` }, signal: AbortSignal.timeout(120000) });
      const data = await response.json();
      return { batch, status: response.status, elapsedMs: Math.round(performance.now() - start), id: data.import?.id, validRows: data.preview?.validRows, error: data.error, pass: response.ok && data.preview?.validRows === 5000 };
    } catch (error) { return { batch, pass: false, elapsedMs: Math.round(performance.now() - start), error: error.message }; }
  }));
  const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await client.connect();
  try {
    const imports = await client.query('select count(*)::integer as count,coalesce(sum(total_rows),0)::integer as rows from ophanim_imports where organization_id=$1', [demo.organizationId]);
    const rows = await client.query('select count(*)::integer as count from ophanim_import_rows where organization_id=$1', [demo.organizationId]);
    const shipments = await client.query('select count(*)::integer as count from ophanim_shipments where organization_id=$1', [demo.organizationId]);
    const integrity = { imports: imports.rows[0].count, declaredRows: imports.rows[0].rows, actualRows: rows.rows[0].count, shipmentsBeforeConfirmation: shipments.rows[0].count };
    const pass = checks.every((check) => check.pass) && integrity.imports === 20 && integrity.actualRows === 100000 && integrity.shipmentsBeforeConfirmation === 0;
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/import-load.json'), JSON.stringify({ checkedAt: new Date().toISOString(), database: demo.database, checks, integrity, pass, scope: '20 simultaneous CSV previews of 5000 rows through real HTTP/SQL; background confirmation/restart still separate tests' }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failures: checks.filter((check) => !check.pass), integrity }));
    if (!pass) process.exitCode = 1;
  } finally { await client.end(); }
}, { native: true });
