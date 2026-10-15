import { randomUUID } from 'node:crypto';
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
    const response = await fetch(base + path, { method, headers: { Origin: base, ...(tenant ? { Cookie: `ophanim_session=${tenant.token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    return { status: response.status, body: await response.json() };
  };
  const record = (check, response, statuses, condition = true) => checks.push({ check, status: response.status, pass: statuses.includes(response.status) && condition });
  const endpoint = (tenant, child = '') => `/api/logistics/zero-day-roll-calls/${tenant.roll}${child}`;
  try {
    for (const tenant of tenants) {
      tenant.auth = randomUUID();
      await database.query('insert into auth.users(id,email) values($1,$2)', [tenant.auth, `${tenant.auth}@example.test`]);
      await database.query('update ophanim_users set auth_user_id=$1 where id=$2', [tenant.auth, tenant.userId]);
      const asset = await call(tenant, '/api/logistics/assets', 'POST', { assetName: `${tenant.marker} private asset`, assetType: 'application' });
      record('own asset positive control', asset, [201]);
      tenant.asset = asset.body.asset?.id;
      const roll = await call(tenant, '/api/logistics/zero-day-roll-calls', 'POST', { cveId: 'CVE-2026-0000', title: `${tenant.marker} synthetic vulnerability exercise`, sourceName: 'Synthetic test only, not an actual advisory' });
      record('own roll-call positive control', roll, [201]);
      tenant.roll = roll.body.rollCall?.id;
      if (!tenant.asset || !tenant.roll) throw new Error('Cyber tenant fixture setup failed.');
      const assessment = await call(tenant, endpoint(tenant, '/assessments'), 'POST', { assetId: tenant.asset, assessmentStatus: 'affected', notes: tenant.marker });
      record('own asset assessment positive control', assessment, [200]);
      tenant.assessment = assessment.body.assessment?.id;
      const decision = await call(tenant, endpoint(tenant, '/decisions'), 'POST', { assessmentId: tenant.assessment, decision: 'note', rationale: `${tenant.marker} synthetic decision` });
      record('own roll-call decision positive control', decision, [201]);
      const evidence = await call(tenant, endpoint(tenant, '/evidence'), 'POST', { assessmentId: tenant.assessment, evidenceType: 'advisory', title: tenant.marker, sourceUrl: 'https://example.test/synthetic-evidence' });
      record('own roll-call evidence positive control', evidence, [201]);
      const mention = randomUUID(); tenant.signal = randomUUID();
      await database.query(`insert into ophanim_dark_web_mentions(id,organization_id,provider_id,provider_document_id,source_category,source_name,first_seen_at,last_seen_at,original_text,content_hash,source_reliability)
        values($1,$2,'synthetic_cyber',$5,'development_fixture',$3,now(),now(),$3,$4,100)`, [mention, tenant.organizationId, tenant.marker, mention.replaceAll('-', '').padEnd(64, '0'), mention]);
      await database.query(`insert into ophanim_signal_assessments(id,organization_id,mention_id,subject_type,subject_id,subject_label,confidence_score,confidence_level)
        values($1,$2,$3,'cyber_asset',$4,$5,70,'high')`, [tenant.signal, tenant.organizationId, mention, tenant.asset, `${tenant.marker} signal`]);
      const room = await call(tenant, `/api/intelligence/assessments/${tenant.signal}/remediation`, 'POST', {});
      record('own remediation positive control', room, [201], Boolean(room.body.communicationDraft?.includes(tenant.marker)));
      tenant.task = (await database.query("select id from ophanim_operational_tasks where organization_id=$1 and workflow_id=$2 and workflow_type='cyber_exposure'", [tenant.organizationId, tenant.signal])).rows[0]?.id;
      if (!tenant.assessment || !tenant.task) throw new Error('Assessment/task fixture setup failed.');
    }
    for (let i = 0; i < 2; i++) {
      const own = tenants[i], other = tenants[1 - i];
      for (const listPath of ['/api/logistics/assets', '/api/logistics/zero-day-roll-calls', '/api/intelligence/tasks']) {
        const list = await call(own, listPath);
        record(`scoped list: ${listPath}`, list, [200], JSON.stringify(list.body).includes(own.marker) && !JSON.stringify(list.body).includes(other.marker));
      }
      const detail = await call(own, endpoint(own));
      record('own roll detail contains assessment, decision and evidence', detail, [200], detail.body.rollCall?.assessments?.length === 1 && detail.body.rollCall?.decisions?.length === 1 && detail.body.rollCall?.evidence?.length === 1 && !JSON.stringify(detail.body).includes(other.marker));
      record('foreign roll read denied', await call(own, endpoint(other)), [403, 404]);
      for (const [path, method, body] of [
        [endpoint(other), 'PATCH', { rollCallStatus: 'closed' }],
        [endpoint(own, '/assessments'), 'POST', { assetId: other.asset, assessmentStatus: 'affected' }],
        [endpoint(other, '/assessments'), 'POST', { assetId: own.asset, assessmentStatus: 'affected' }],
        [endpoint(other, '/decisions'), 'POST', { decision: 'approve', rationale: 'FORBIDDEN' }],
        [endpoint(own, '/decisions'), 'POST', { assessmentId: other.assessment, decision: 'approve', rationale: 'FORBIDDEN LINK' }],
        [endpoint(other, '/evidence'), 'POST', { evidenceType: 'advisory', title: 'FORBIDDEN', sourceUrl: 'https://example.test/forbidden' }],
        [endpoint(own, '/evidence'), 'POST', { assessmentId: other.assessment, evidenceType: 'advisory', title: 'FORBIDDEN LINK', sourceUrl: 'https://example.test/forbidden' }],
        [`/api/intelligence/assessments/${other.signal}/remediation`, 'POST', {}],
        [`/api/intelligence/tasks/${other.task}`, 'PATCH', { taskStatus: 'completed', completionNote: 'FORBIDDEN' }],
      ]) record(`foreign mutation denied: ${method} ${path.replaceAll(/[0-9a-f-]{36}/g, ':id')}`, await call(own, path, method, body), [400, 403, 404]);
      const unchanged = await database.query('select roll_call_status from ophanim_zero_day_roll_calls where id=$1', [other.roll]);
      const task = await database.query('select task_status,completion_note from ophanim_operational_tasks where id=$1', [other.task]);
      checks.push({ check: 'foreign roll and task unchanged in database', pass: unchanged.rows[0]?.roll_call_status === 'open' && task.rows[0]?.task_status === 'open' && !task.rows[0]?.completion_note });
      const spare = await call(own, '/api/logistics/zero-day-roll-calls', 'POST', { cveId: 'CVE-2026-0001', title: `${own.marker} RLS fixture` });
      const spareId = spare.body.rollCall?.id;
      if (!spareId) throw new Error('RLS positive-control setup failed.');
      const privileges = (await database.query("select has_table_privilege('authenticated','ophanim_zero_day_asset_assessments','INSERT') as assessment_write")).rows[0];
      checks.push({ check: 'roll-call assessment Data API remains deny-by-default', pass: privileges.assessment_write === false });
      let blocked = false, roleVerified = false;
      await database.query('begin');
      try {
        await database.query("select set_config('request.jwt.claim.sub',$1,true)", [own.auth]);
        await database.query('set local role authenticated');
        const ownShipment = await database.query('select id from ophanim_shipments where id=$1', [own.records.shipment]);
        const otherShipment = await database.query('select id from ophanim_shipments where id=$1', [other.records.shipment]);
        roleVerified = ownShipment.rowCount === 1 && otherShipment.rowCount === 0;
        checks.push({ check: 'authenticated database identity positive control: own shipment readable, foreign shipment hidden', pass: roleVerified });
        if (!roleVerified) throw new Error('Database identity control failed.');
        await database.query(`insert into ophanim_zero_day_asset_assessments(organization_id,roll_call_id,asset_id,assessment_status) values($1,$2,$3,'unknown')`, [own.organizationId, spareId, other.asset]);
        await database.query('commit');
      } catch (error) { await database.query('rollback'); blocked = roleVerified && ['42501', '23514'].includes(error.code); }
      checks.push({ check: 'authenticated role cannot attach a foreign private asset (table privilege boundary)', pass: blocked });
      const poisoned = await call(own, `/api/logistics/zero-day-roll-calls/${spareId}`);
      record('API does not disclose foreign asset through RLS-created child link', poisoned, [200], !JSON.stringify(poisoned.body).includes(other.marker));
    }
    const viewer = { token: tenants[0].sessions.viewer };
    record('viewer own roll read', await call(viewer, endpoint(tenants[0])), [200]);
    record('viewer cannot assess assets', await call(viewer, endpoint(tenants[0], '/assessments'), 'POST', { assetId: tenants[0].asset, assessmentStatus: 'affected' }), [401, 403]);
    record('viewer cannot start remediation', await call(viewer, `/api/intelligence/assessments/${tenants[0].signal}/remediation`, 'POST', {}), [401, 403]);
    record('anonymous cannot read roll', await call(null, endpoint(tenants[0])), [401, 403]);
    const artifact = { checkedAt: new Date().toISOString(), database: 'native PostgreSQL 18', scope: 'Synthetic HTTP plus authenticated database-role attacks; no actual scans, live advisories or provider traffic', checks };
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/cyber-tenants.json'), JSON.stringify(artifact, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failed: checks.filter((check) => !check.pass) }));
    if (checks.some((check) => !check.pass)) process.exitCode = 1;
  } finally { await database.end(); }
}, { native: true, databaseArgs: ['--tenant-fixtures'] });
