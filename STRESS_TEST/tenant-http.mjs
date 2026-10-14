import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const tenants = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/tenant-context.json'), 'utf8'));
  const checks = [];
  const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await client.connect();
  const call = async (tenant, path, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, { method, headers: { Cookie: `ophanim_session=${tenant.token}`, Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    return { status: response.status, text: await response.text() };
  };
  const endpoints = (tenant) => [
    `/api/logistics/shipments/${tenant.records.shipment}`,
    `/api/imports/${tenant.records.import}`,
    `/api/imports/${tenant.records.import}/error-report`,
    `/api/platform/entities/${tenant.records.entity}`,
    `/api/platform/cases/${tenant.records.case}`,
  ];
  try {
    for (let i = 0; i < tenants.length; i++) {
      const own = tenants[i], other = tenants[1 - i];
      for (const path of endpoints(own)) {
        const result = await call(own, path);
        checks.push({ check: 'positive control: own record', path, status: result.status, pass: result.status === 200 });
      }
      for (const path of endpoints(other)) {
        const result = await call(own, path);
        checks.push({ check: 'other tenant read', path, status: result.status, pass: [403, 404].includes(result.status) && !result.text.includes(other.marker) });
      }
      for (const [method, path, body] of [
        ['PATCH', `/api/logistics/shipments/${other.records.shipment}`, { shipmentReference: 'FORBIDDEN_CHANGE' }],
        ['DELETE', `/api/logistics/shipments/${other.records.shipment}`],
        ['POST', `/api/imports/${other.records.import}/confirm`, {}],
      ]) {
        const result = await call(own, path, method, body);
        checks.push({ check: 'other tenant mutation', path, method, status: result.status, pass: [400, 403, 404].includes(result.status) && !result.text.includes(other.marker) });
      }
      const injection = await call(own, '/api/platform/evidence', 'POST', { evidenceType: 'manual', title: `${own.marker}_UNAUTHORIZED_LINK`, metadata: {}, links: [{ resourceType: 'case', resourceId: other.records.case }] });
      checks.push({ check: 'evidence cannot link into a foreign private case', status: injection.status, pass: [400, 403, 404].includes(injection.status) });
      const otherCase = await call(other, `/api/platform/cases/${other.records.case}`);
      checks.push({ check: 'foreign evidence cannot appear in case detail', status: otherCase.status, pass: otherCase.status === 200 && !otherCase.text.includes(own.marker) });
      for (const path of ['/api/logistics/shipments', '/api/platform/entities', '/api/platform/events', '/api/platform/cases', '/api/platform/evidence']) {
        const result = await call(own, path);
        checks.push({ check: 'scoped list includes own, excludes other marker', path, status: result.status, pass: result.status === 200 && result.text.includes(own.marker) && !result.text.includes(other.marker) });
      }
      const saved = await client.query('select shipment_reference,archived_at from ophanim_shipments where id=$1', [other.records.shipment]);
      checks.push({ check: 'database proves foreign shipment unchanged', pass: saved.rows[0]?.shipment_reference === other.marker && saved.rows[0]?.archived_at === null });
    }
    await mkdir(resolve(root, 'STRESS_TEST/artifacts'), { recursive: true });
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/tenant-http.json'), JSON.stringify({ checkedAt: new Date().toISOString(), database: 'embedded PostgreSQL socket; sequential HTTP, not native concurrency', coverage: 'shipments/imports/entities/events/cases/evidence; knowledge/alerts/files/Verify and child links still pending', checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failed: checks.filter((check) => !check.pass) }));
    if (checks.some((check) => !check.pass)) throw new Error('Tenant HTTP checks failed; inspect artifact before certification.');
  } finally { await client.end(); }
}, { databaseArgs: ['--tenant-fixtures'] });
