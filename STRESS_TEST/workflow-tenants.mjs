import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const tenants = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/tenant-context.json'), 'utf8'));
  const database = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await database.connect();
  const checks = [];
  const call = async (tenant, path, method = 'GET', body) => {
    const response = await fetch(base + path, { method,
      headers: { Origin: base, ...(tenant ? { Cookie: `ophanim_session=${tenant.token}` } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
    return { status: response.status, body: await response.json() };
  };
  const record = (check, response, expected, extra = true) => {
    const pass = expected.includes(response.status) && extra;
    checks.push({ check, status: response.status, pass });
    return pass;
  };
  const path = (tenant, child = '') => `/api/logistics/rescue-cases/${tenant.rescue}${child}`;
  const childCounts = async (id) => (await database.query(`select
    (select count(*)::int from ophanim_rescue_actions where rescue_case_id=$1) as actions,
    (select count(*)::int from ophanim_rescue_decisions where rescue_case_id=$1) as decisions,
    (select count(*)::int from ophanim_rescue_evidence where rescue_case_id=$1) as evidence`, [id])).rows[0];
  try {
    for (const tenant of tenants) {
      const rescue = await call(tenant, '/api/logistics/rescue-cases', 'POST', { shipmentId: tenant.records.shipment, objective: `${tenant.marker} review freight options`, summary: 'Synthetic workflow security fixture only.' });
      if (!record('own rescue creation positive control', rescue, [201])) throw new Error('Rescue fixture setup failed.');
      tenant.rescue = rescue.body.rescueCase.id;
      const action = await call(tenant, path(tenant, '/actions'), 'POST', { actionType: 'carrier_contact', title: `${tenant.marker} request options` });
      if (!record('own action positive control', action, [201])) throw new Error('Action fixture setup failed.');
      tenant.action = action.body.action.id;
      const decision = await call(tenant, path(tenant, '/decisions'), 'POST', { actionId: tenant.action, decision: 'approved', rationale: `${tenant.marker} synthetic operator approval, not an actual booking` });
      record('own decision is persisted', decision, [201], decision.body.decision?.actionId === tenant.action);
      const evidence = await call(tenant, path(tenant, '/evidence'), 'POST', { actionId: tenant.action, evidenceType: 'document', title: `${tenant.marker} synthetic evidence`, sourceUrl: 'https://example.test/synthetic-proof' });
      record('own evidence positive control without fetching URL', evidence, [201]);
    }
    for (let i = 0; i < 2; i++) {
      const own = tenants[i], other = tenants[1 - i];
      const before = await childCounts(other.rescue);
      const detail = await call(own, path(own));
      record('own detail includes decision and evidence, excludes foreign marker', detail, [200], JSON.stringify(detail.body).includes(own.marker) && !JSON.stringify(detail.body).includes(other.marker) && detail.body.rescueCase?.actions?.[0]?.actionStatus === 'approved');
      record('foreign case read denied', await call(own, path(other)), [403, 404]);
      const list = await call(own, '/api/logistics/rescue-cases');
      record('case list tenant-scoped with own positive control', list, [200], JSON.stringify(list.body).includes(own.marker) && !JSON.stringify(list.body).includes(other.marker));
      for (const [target, method, body] of [
        ['/api/logistics/rescue-cases', 'POST', { shipmentId: other.records.shipment, objective: 'FORBIDDEN CROSS-TENANT SHIPMENT' }],
        [path(other), 'PATCH', { caseStatus: 'closed' }],
        [path(other, '/actions'), 'POST', { actionType: 'hold', title: 'FORBIDDEN ACTION' }],
        [path(other, '/decisions'), 'POST', { actionId: other.action, decision: 'rejected', rationale: 'FORBIDDEN DECISION' }],
        [path(other, '/evidence'), 'POST', { evidenceType: 'document', title: 'FORBIDDEN EVIDENCE', sourceUrl: 'https://example.test/forbidden' }],
        [path(own, '/decisions'), 'POST', { actionId: other.action, decision: 'rejected', rationale: 'FORBIDDEN FOREIGN ACTION LINK' }],
        [path(own, '/evidence'), 'POST', { actionId: other.action, evidenceType: 'approval', title: 'FORBIDDEN FOREIGN ACTION LINK', sourceUrl: 'https://example.test/forbidden' }],
      ]) record(`foreign write or child link denied: ${method} ${target.replaceAll(/[0-9a-f-]{36}/g, ':id')}`, await call(own, target, method, body), [400, 403, 404]);
      checks.push({ check: 'database proves foreign child counts unchanged', pass: JSON.stringify(await childCounts(other.rescue)) === JSON.stringify(before) });
      const untouched = await database.query('select case_status from ophanim_rescue_cases where id=$1', [other.rescue]);
      checks.push({ check: 'database proves foreign case not closed', pass: untouched.rows[0]?.case_status === 'open' });
    }
    const viewer = { token: tenants[0].sessions.viewer };
    record('viewer can inspect own rescue', await call(viewer, path(tenants[0])), [200]);
    record('viewer cannot record an approval', await call(viewer, path(tenants[0], '/decisions'), 'POST', { actionId: tenants[0].action, decision: 'approved', rationale: 'FORBIDDEN VIEWER APPROVAL' }), [401, 403]);
    record('anonymous case read rejected', await call(null, path(tenants[0])), [401, 403]);
    record('anonymous approval rejected', await call(null, path(tenants[0], '/decisions'), 'POST', { decision: 'approved', rationale: 'FORBIDDEN ANONYMOUS' }), [401, 403]);
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/workflow-tenants.json'), JSON.stringify({ checkedAt: new Date().toISOString(), database: 'native PostgreSQL 18', scope: 'Actual rescue-case/actions/decisions/evidence HTTP endpoints, synthetic organizations; source URLs stored only, no third-party contact', checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failed: checks.filter((check) => !check.pass) }));
    if (checks.some((check) => !check.pass)) throw new Error('Workflow tenant acceptance failed.');
  } finally { await database.end(); }
}, { native: true, databaseArgs: ['--tenant-fixtures'] });
