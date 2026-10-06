import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260827091242_phase1_tenant_rls.sql'),
  'utf8',
);
const integrityMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260827092746_phase1_child_tenant_integrity.sql'),
  'utf8',
);
const ledgerMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260827140815_phase1_migration_ledger_security.sql'),
  'utf8',
);

describe('Supabase Phase 1 tenant boundary', () => {
  it('links application users to Supabase Auth without using user metadata for authorization', () => {
    expect(migration).toContain('auth_user_id uuid unique references auth.users(id)');
    expect(migration).toContain('app_user.auth_user_id = (select auth.uid())');
    expect(migration).not.toMatch(/raw_user_meta_data|user_metadata[^:]/);
  });

  it('locks every Ophanim table and explicitly grants only Phase 1 surfaces', () => {
    expect(migration).toContain("tablename like 'ophanim\\_%'");
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on table public.%I from anon, authenticated');
    for (const table of ['ophanim_shipments', 'ophanim_imports', 'ophanim_import_rows', 'ophanim_documents']) {
      expect(migration).toContain(`'${table}'`);
    }
  });

  it('keeps private files in an organization-prefixed private bucket', () => {
    expect(migration).toContain("'ophanim-private'");
    expect(migration).toContain('public = excluded.public');
    expect(migration).toContain('ophanim_private_objects_select');
    expect(migration).toContain('ophanim_private_objects_insert');
    expect(migration).toContain('ophanim_private_objects_update');
    expect(migration).toContain('ophanim_private_objects_delete');
    expect(migration).toContain('app_private.storage_organization_id(name)');
  });

  it('prevents tenant-key and parent-record mismatches', () => {
    for (const constraint of [
      'ophanim_shipment_route_stops_shipment_tenant_fk',
      'ophanim_shipment_milestones_shipment_tenant_fk',
      'ophanim_import_rows_import_tenant_fk',
      'ophanim_import_jobs_import_tenant_fk',
      'ophanim_documents_shipment_tenant_fk',
      'ophanim_route_waypoints_route_tenant_fk',
    ]) {
      expect(integrityMigration).toContain(constraint);
    }
  });

  it('keeps the migration ledger outside the public Data API surface', () => {
    expect(ledgerMigration).toContain('ophanim_schema_migrations enable row level security');
    expect(ledgerMigration).toContain('revoke all on table public.ophanim_schema_migrations from anon, authenticated');
  });
});
