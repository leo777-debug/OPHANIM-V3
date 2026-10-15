import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const [own, other] = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/tenant-context.json'), 'utf8'));
  const database = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await database.connect();
  const checks = [];
  const request = async (tenant, path, body) => {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET', headers: { Cookie: `ophanim_session=${tenant.token}`, Origin: base, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const shipment = await request(own, '/api/logistics/shipments', { shipmentReference: 'SYNTHETIC-ALERT-BURST', vesselName: 'SYNTHETIC BURST VESSEL', imoNumber: '1234567' });
    if (shipment.status !== 201) throw new Error(`Synthetic alert shipment setup failed: HTTP ${shipment.status}; ${String(shipment.body.error ?? 'unknown').slice(0, 240)}`);
    for (let i = 0; i < 100; i++) {
      const id = randomUUID();
      await database.query(`insert into ophanim_dark_web_mentions
        (id,organization_id,provider_id,provider_document_id,source_category,source_name,first_seen_at,last_seen_at,original_text,content_hash,source_reliability,independent_source_count,source_chain_label)
        values($1,$2,'synthetic_burst',$5,'development_fixture','SYNTHETIC ALERT BURST',now(),now(),$3,$4,100,3,'independent_source')`,
      [id, own.organizationId, 'SYNTHETIC ONLY: IMO 1234567 / SYNTHETIC BURST VESSEL. No real incident.', id.replaceAll('-', '').padEnd(64, '0'), id]);
    }
    const started = performance.now();
    const runs = await Promise.all(Array.from({ length: 4 }, () => request(own, '/api/intelligence/reconcile', {})));
    checks.push({ check: 'four concurrent deterministic reconciliation requests', statuses: runs.map((run) => run.status), elapsedMs: Math.round(performance.now() - started), pass: runs.every((run) => run.status === 200) });
    const counts = await database.query(`select
      count(distinct a.id)::int as alerts, count(distinct s.id)::int as assessments,
      count(distinct t.id)::int as tasks
      from ophanim_dark_web_mentions m
      join ophanim_signal_assessments s on s.mention_id=m.id and s.organization_id=m.organization_id
      left join ophanim_intelligence_alerts a on a.assessment_id=s.id and a.organization_id=s.organization_id
      left join ophanim_operational_tasks t on t.workflow_id=s.id and t.organization_id=s.organization_id
      where m.organization_id=$1 and m.provider_id='synthetic_burst'`, [own.organizationId]);
    checks.push({ check: '100 real generated alerts, assessments and verification tasks without duplicate race', ...counts.rows[0], pass: Object.values(counts.rows[0]).every((count) => count === 100) });
    const alerts = await request(own, '/api/intelligence/alerts');
    checks.push({ check: 'own generated alert positive control', status: alerts.status, pass: alerts.status === 200 && JSON.stringify(alerts.body).includes('SYNTHETIC-ALERT-BURST') });
    const foreign = await request(other, '/api/intelligence/alerts');
    checks.push({ check: 'generated alerts not visible across tenants', status: foreign.status, pass: foreign.status === 200 && !JSON.stringify(foreign.body).includes('SYNTHETIC-ALERT-BURST') });
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/alert-burst.json'), JSON.stringify({ checkedAt: new Date().toISOString(), database: 'native PostgreSQL 18', scope: 'Synthetic local mentions only; real deterministic reconciliation; no live dark-web provider, email or AI requests', checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failed: checks.filter((check) => !check.pass) }));
    if (checks.some((check) => !check.pass)) throw new Error('Generated-alert burst acceptance failed.');
  } finally { await database.end(); }
}, { native: true, databaseArgs: ['--tenant-fixtures'] });
