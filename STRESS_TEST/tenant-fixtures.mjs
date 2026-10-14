import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function seedTenantFixtures(database, first) {
  const tenants = [{ ...first, marker: 'TENANT_A_SYNTHETIC_PRIVATE' }];
  const second = { organizationId: randomUUID(), userId: randomUUID(), token: 'synthetic-tenant-b-session', marker: 'TENANT_B_SYNTHETIC_PRIVATE' };
  await database.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3)', [second.organizationId, 'DEMO ONLY - Tenant B', 'competition-demo-b']);
  await database.query('insert into ophanim_users(id,email,display_name) values($1,$2,$3)', [second.userId, 'tenant-b@example.test', 'Synthetic Tenant B']);
  await database.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'owner')", [second.organizationId, second.userId]);
  await database.query("insert into ophanim_sessions(user_id,organization_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')", [second.userId, second.organizationId, createHash('sha256').update(second.token).digest('hex')]);
  tenants.push(second);
  const viewerId = randomUUID();
  await database.query('insert into ophanim_users(id,email) values($1,$2)', [viewerId, 'viewer@example.test']);
  await database.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'viewer')", [first.organizationId, viewerId]);
  tenants[0].sessions = {};
  for (const kind of ['expired', 'revoked', 'viewer']) {
    const token = `synthetic-tenant-a-${kind}-session`;
    tenants[0].sessions[kind] = token;
    await database.query("insert into ophanim_sessions(user_id,organization_id,token_hash,expires_at,revoked_at) values($1,$2,$3,case when $4 then now()-interval '1 day' else now()+interval '1 day' end,case when $5 then now() else null end)", [kind === 'viewer' ? viewerId : first.userId, first.organizationId, createHash('sha256').update(token).digest('hex'), kind === 'expired', kind === 'revoked']);
  }
  for (const tenant of tenants) {
    tenant.records = {};
    const add = async (name, table, columns, data) => {
      const id = randomUUID();
      const values = [id, tenant.organizationId, ...data];
      // All SQL identifiers are fixed test fixtures, never supplied by a user.
      await database.query(`insert into ${table}(id,organization_id,${columns.join(',')}) values(${values.map((_, index) => `$${index + 1}`).join(',')})`, values);
      tenant.records[name] = id;
    };
    await add('shipment', 'ophanim_shipments', ['shipment_reference'], [tenant.marker]);
    await add('import', 'ophanim_imports', ['import_type', 'file_name', 'file_size_bytes', 'file_sha256', 'column_mapping'], ['shipment', `${tenant.marker}.csv`, 100, 'a'.repeat(64), '{}']);
    await add('entity', 'ophanim_entities', ['entity_type', 'canonical_name', 'normalized_key'], ['port', tenant.marker, tenant.marker.toLowerCase()]);
    await add('case', 'ophanim_cases', ['title'], [tenant.marker]);
    await add('event', 'ophanim_events', ['event_type', 'title', 'summary'], ['weather', tenant.marker, 'Synthetic isolation fixture only']);
    await add('evidence', 'ophanim_evidence', ['evidence_type', 'title'], ['manual', tenant.marker]);
    const storagePath = `${tenant.organizationId}/synthetic/private.txt`;
    await add('document', 'ophanim_knowledge_documents', ['created_by_user_id', 'file_name', 'storage_path', 'mime_type', 'file_size_bytes', 'content_hash', 'status'], [tenant.userId, `${tenant.marker}.txt`, storagePath, 'text/plain', tenant.marker.length, createHash('sha256').update(tenant.marker).digest('hex'), 'ready']);
    await database.query("insert into ophanim_knowledge_chunks(organization_id,document_id,ordinal,content,content_hash,source_file,document_type,language) values($1,$2,0,$3,$4,'private.txt','other','en')", [tenant.organizationId, tenant.records.document, tenant.marker, createHash('sha256').update(tenant.marker).digest('hex')]);
    const file = resolve('STRESS_TEST/runtime/private-files', storagePath);
    await mkdir(resolve(file, '..'), { recursive: true });
    await writeFile(file, tenant.marker);
    tenant.records.verify = randomUUID();
    const recordedAt = '2026-10-01T00:00:00.000Z';
    const result = {
      id: tenant.records.verify, claim: { text: tenant.marker, type: 'earthquake', place: { name: 'Synthetic demo place', latitude: 0, longitude: 0 }, start: recordedAt, end: '2026-10-02T00:00:00.000Z', entities: [], expectedObservation: 'Synthetic tenant test only', minimumMagnitude: 5 },
      verdict: 'NOT CONFIRMED YET', summary: 'Synthetic isolation fixture, not a real check', checkedAt: recordedAt, mode: 'replay', replay: { fixture: 'synthetic-tenant-test', recordedAt, provenance: 'synthetic_test_fixture' }, evidence: [], checked: [], couldNotCheck: [],
    };
    await database.query('insert into ophanim_verify_runs(id,organization_id,user_id,result,checked_at) values($1,$2,$3,$4,$5)', [result.id, tenant.organizationId, tenant.userId, JSON.stringify(result), recordedAt]);
  }
  return tenants;
}
