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
    `/api/knowledge/documents/${tenant.records.document}`,
    `/api/knowledge/documents/${tenant.records.document}?download=1`,
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
        ['DELETE', `/api/knowledge/documents/${other.records.document}`],
        ['POST', '/api/verify/check', { previousId: other.records.verify, confirmed: true }],
        ['POST', '/api/verify/shares', { id: other.records.verify, publicConsent: true }],
      ]) {
        const result = await call(own, path, method, body);
        checks.push({ check: 'other tenant mutation', path, method, status: result.status, pass: [400, 403, 404].includes(result.status) && !result.text.includes(other.marker) });
      }
      const injection = await call(own, '/api/platform/evidence', 'POST', { evidenceType: 'manual', title: `${own.marker}_UNAUTHORIZED_LINK`, metadata: {}, links: [{ resourceType: 'case', resourceId: other.records.case }] });
      checks.push({ check: 'evidence cannot link into a foreign private case', status: injection.status, pass: [400, 403, 404].includes(injection.status) });
      const otherCase = await call(other, `/api/platform/cases/${other.records.case}`);
      checks.push({ check: 'foreign evidence cannot appear in case detail', status: otherCase.status, pass: otherCase.status === 200 && !otherCase.text.includes(own.marker) });
      for (const path of ['/api/logistics/shipments', '/api/platform/entities', '/api/platform/events', '/api/platform/cases', '/api/platform/evidence', '/api/knowledge/documents', '/api/verify/history']) {
        const result = await call(own, path);
        checks.push({ check: 'scoped list includes own, excludes other marker', path, status: result.status, pass: result.status === 200 && result.text.includes(own.marker) && !result.text.includes(other.marker) });
      }
      const saved = await client.query('select shipment_reference,archived_at from ophanim_shipments where id=$1', [other.records.shipment]);
      checks.push({ check: 'database proves foreign shipment unchanged', pass: saved.rows[0]?.shipment_reference === other.marker && saved.rows[0]?.archived_at === null });
      const document = await client.query('select status from ophanim_knowledge_documents where id=$1', [other.records.document]);
      checks.push({ check: 'database proves foreign document not queued for deletion', pass: document.rows[0]?.status === 'ready' });
    }
    for (const kind of ['expired', 'revoked']) {
      const denied = await call({ token: tenants[0].sessions[kind] }, '/api/logistics/shipments');
      checks.push({ check: `${kind} session cannot access protected shipments`, status: denied.status, pass: denied.status === 401 });
    }
    const viewer = { token: tenants[0].sessions.viewer };
    const readable = await call(viewer, '/api/logistics/shipments');
    checks.push({ check: 'viewer positive read control', status: readable.status, pass: readable.status === 200 && readable.text.includes(tenants[0].marker) && !readable.text.includes(tenants[1].marker) });
    for (const [method, path, body] of [
      ['POST', '/api/logistics/shipments', { shipmentReference: 'FORBIDDEN_VIEWER_CREATE' }],
      ['DELETE', `/api/logistics/shipments/${tenants[0].records.shipment}`],
      ['DELETE', `/api/knowledge/documents/${tenants[0].records.document}`],
      ['PUT', '/api/platform/configuration', { demoModeEnabled: true }],
      ['POST', '/api/scanner', { target: '203.0.113.10', confirm: true }],
    ]) {
      const denied = await call(viewer, path, method, body);
      checks.push({ check: 'viewer cannot mutate or administer', path, method, status: denied.status, pass: [401, 403].includes(denied.status) });
    }
    const forged = await call({ token: `${tenants[0].token}; ophanim_organization=${tenants[1].organizationId}` }, '/api/logistics/shipments');
    checks.push({ check: 'forged workspace cookie does not switch legacy session tenant', pass: forged.status === 200 && forged.text.includes(tenants[0].marker) && !forged.text.includes(tenants[1].marker) });
    const revoked = await call(tenants[0], '/api/auth/logout', 'POST', {});
    const rejected = await call(tenants[0], '/api/logistics/shipments');
    checks.push({ check: 'logout revokes old token for subsequent protected requests', status: rejected.status, pass: revoked.status === 200 && rejected.status === 401 });
    await mkdir(resolve(root, 'STRESS_TEST/artifacts'), { recursive: true });
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/tenant-http.json'), JSON.stringify({ checkedAt: new Date().toISOString(), database: 'embedded PostgreSQL socket; sequential HTTP, not native concurrency', coverage: 'core records, private knowledge documents/download/delete, Verify history/recheck/share ownership, legacy logout; alerts, other files/child links and complete role coverage still pending', checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failed: checks.filter((check) => !check.pass) }));
    if (checks.some((check) => !check.pass)) throw new Error('Tenant HTTP checks failed; inspect artifact before certification.');
  } finally { await client.end(); }
}, { databaseArgs: ['--tenant-fixtures'] });
