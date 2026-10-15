import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { withIsolatedApp } from './harness.mjs';

const native = process.argv.includes('--native');
await withIsolatedApp(async ({ base, root }) => {
  const tenants = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/tenant-context.json'), 'utf8'));
  const database = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await database.connect();
  const checks = [];
  const call = async (token, path, method = 'GET', body) => {
    const started = performance.now();
    const response = await fetch(base + path, { method, headers: { Cookie: `ophanim_session=${token}`, Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    return { status: response.status, text: await response.text(), elapsedMs: Math.round(performance.now() - started), headers: response.headers };
  };
  try {
    for (const tenant of tenants) {
      const mention = randomUUID(), assessment = randomUUID(), alert = randomUUID();
      await database.query(`insert into ophanim_dark_web_mentions(id,organization_id,provider_id,provider_document_id,source_category,source_name,first_seen_at,last_seen_at,original_text,content_hash,source_reliability)
        values($1,$2,'synthetic_test',$5,'development_fixture',$3,now(),now(),$3,$4,100)`, [mention, tenant.organizationId, tenant.marker, 'a'.repeat(64), mention]);
      await database.query(`insert into ophanim_signal_assessments(id,organization_id,mention_id,subject_type,subject_id,subject_label,confidence_score,confidence_level)
        values($1,$2,$3,'shipment',$4,$5,70,'high')`, [assessment, tenant.organizationId, mention, tenant.records.shipment, tenant.marker]);
      await database.query(`insert into ophanim_intelligence_alerts(id,organization_id,assessment_id,alert_category,title,summary) values($1,$2,$3,'logistics',$4,$4)`, [alert, tenant.organizationId, assessment, tenant.marker]);
      tenant.alert = alert;
    }
    for (let i = 0; i < 2; i++) {
      const own = tenants[i], other = tenants[1 - i];
      const list = await call(own.token, '/api/intelligence/alerts');
      checks.push({ check: 'alerts are tenant-scoped', status: list.status, pass: list.status === 200 && list.text.includes(own.marker) && !list.text.includes(other.marker) });
      const foreign = await call(own.token, `/api/intelligence/alerts/${other.alert}`, 'PATCH', { status: 'closed' });
      checks.push({ check: 'foreign alert cannot be changed', status: foreign.status, pass: [400, 403, 404].includes(foreign.status) });
      const unchanged = await database.query('select alert_status from ophanim_intelligence_alerts where id=$1', [other.alert]);
      checks.push({ check: 'foreign alert unchanged in database', pass: unchanged.rows[0]?.alert_status === 'open' });
      const positive = await call(own.token, `/api/intelligence/alerts/${own.alert}`, 'PATCH', { status: 'acknowledged' });
      checks.push({ check: 'own alert mutation positive control', status: positive.status, pass: positive.status === 200 });
      await call(own.token, `/api/intelligence/alerts/${own.alert}`, 'PATCH', { status: 'open' });
    }
    const roles = {};
    for (const role of ['owner', 'operations_manager', 'analyst', 'viewer']) {
      if (role === 'owner') roles[role] = tenants[0].token;
      else {
        const id = randomUUID(), token = `synthetic-${role}-${randomUUID()}`;
        await database.query('insert into ophanim_users(id,email) values($1,$2)', [id, `${id}@example.test`]);
        await database.query('insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,$3)', [tenants[0].organizationId, id, role]);
        await database.query("insert into ophanim_sessions(user_id,organization_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')", [id, tenants[0].organizationId, createHash('sha256').update(token).digest('hex')]);
        roles[role] = token;
      }
      const read = await call(roles[role], '/api/logistics/shipments');
      checks.push({ check: `${role} can read own shipments`, pass: read.status === 200 && !read.text.includes(tenants[1].marker) });
      const create = await call(roles[role], '/api/logistics/shipments', 'POST', { shipmentReference: `SYN-ROLE-${role}` });
      checks.push({ check: `${role} shipment write permission`, status: create.status, pass: role === 'viewer' ? [401, 403].includes(create.status) : create.status === 201 });
      const admin = await call(roles[role], '/api/platform/configuration', 'PUT', { demoModeEnabled: true });
      checks.push({ check: `${role} cannot bypass owner administration`, status: admin.status, pass: role === 'owner' ? admin.status === 200 : [401, 403].includes(admin.status) });
    }
    const burst = await Promise.all(Array.from({ length: 100 }, (_, i) => call(tenants[0].token, '/api/platform/notifications', 'POST', {
      eventType: 'synthetic_test', title: `SYNTHETIC ALERT ${i}`, summary: 'Synthetic burst test only', payload: {},
    })));
    checks.push({ check: '100 concurrent notification creations', responses: burst.map((item) => item.status), pass: burst.every((item) => item.status === 201) });
    const otherNotifications = await call(tenants[1].token, '/api/platform/notifications');
    checks.push({ check: 'notification burst not visible across tenants', pass: otherNotifications.status === 200 && !otherNotifications.text.includes('SYNTHETIC ALERT') });
    if (!native) {
    await database.query(`insert into ophanim_knowledge_documents(organization_id,created_by_user_id,file_name,storage_path,mime_type,file_size_bytes,content_hash,status)
      select $1::uuid,$2::uuid,'SYNTHETIC-DOC-'||i::text||'.txt',$1::text||'/scale/'||i::text,'text/plain',100,encode(digest('scale-'||i::text,'sha256'),'hex'),'ready'
      from generate_series(1,1000) i`, [tenants[0].organizationId, tenants[0].userId]);
    const docs = await call(tenants[0].token, '/api/knowledge/documents');
    const parsed = JSON.parse(docs.text);
    checks.push({ check: '1000-document list stays bounded and scoped', status: docs.status, elapsedMs: docs.elapsedMs, returned: parsed.documents?.length, pass: docs.status === 200 && parsed.documents?.length === 500 && !docs.text.includes(tenants[1].marker), limitation: 'Existing 500-document cap has no continuation UI; report as P2, not complete pagination.' });
    }
    const verification = await Promise.all(Array.from({ length: 30 }, () => call(tenants[0].token, '/api/verify/check', 'POST', { claim: { text: 'Synthetic claim' }, confirmed: true, fixture: 'earthquake', useAi: false })));
    checks.push({ check: 'Verify burst completes or rate-limits without server errors', counts: Object.fromEntries([200, 429].map((status) => [status, verification.filter((item) => item.status === status).length])), pass: verification.some((item) => item.status === 200) && verification.some((item) => item.status === 429) && verification.every((item) => [200, 429].includes(item.status)) });
    const health = await call(tenants[0].token, '/api/health');
    checks.push({ check: 'health security headers and no permissive CORS', pass: health.headers.get('x-content-type-options') === 'nosniff' && health.headers.get('x-frame-options') === 'SAMEORIGIN' && !health.headers.has('access-control-allow-origin') });
    await writeFile(resolve(root, `STRESS_TEST/artifacts/extended-security${native ? '-native' : ''}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), database: native ? 'native PostgreSQL 18; Knowledge/pgvector scale assessed separately' : 'embedded PostgreSQL with pgvector; not native concurrency', checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((item) => item.pass).length, failed: checks.filter((item) => !item.pass) }));
    if (checks.some((item) => !item.pass)) process.exitCode = 1;
  } finally { await database.end(); }
}, { native, databaseArgs: ['--tenant-fixtures'] });
