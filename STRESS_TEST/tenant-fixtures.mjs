import { createHash, randomUUID } from 'node:crypto';

export async function seedTenantFixtures(database, first) {
  const tenants = [{ ...first, marker: 'TENANT_A_SYNTHETIC_PRIVATE' }];
  const second = { organizationId: randomUUID(), userId: randomUUID(), token: 'synthetic-tenant-b-session', marker: 'TENANT_B_SYNTHETIC_PRIVATE' };
  await database.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3)', [second.organizationId, 'DEMO ONLY - Tenant B', 'competition-demo-b']);
  await database.query('insert into ophanim_users(id,email,display_name) values($1,$2,$3)', [second.userId, 'tenant-b@example.test', 'Synthetic Tenant B']);
  await database.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'owner')", [second.organizationId, second.userId]);
  await database.query("insert into ophanim_sessions(user_id,organization_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')", [second.userId, second.organizationId, createHash('sha256').update(second.token).digest('hex')]);
  tenants.push(second);
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
  }
  return tenants;
}
