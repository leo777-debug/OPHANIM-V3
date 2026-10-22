import { db } from '@/lib/watchlists/db';
import type { AuthenticatedActor } from './actor';

// Dedicated identities: never select an existing customer's organization or user.
export const SHARED_ORGANIZATION_ID = 'b89e9c10-6e65-4f11-92ec-0ce23f117001';
export const SHARED_USER_ID = 'b89e9c10-6e65-4f11-92ec-0ce23f117002';
let provisioning: Promise<void> | undefined;

async function provision(): Promise<void> {
  const client = await db().connect();
  try {
    await client.query('begin');
    await client.query(`insert into ophanim_organizations (id, name, slug)
      values ($1, 'Ophanim shared workspace', 'ophanim-shared-workspace') on conflict (id) do nothing`, [SHARED_ORGANIZATION_ID]);
    await client.query(`insert into ophanim_users (id, external_subject, display_name)
      values ($1, 'ophanim:shared-workspace', 'Shared workspace') on conflict (id) do nothing`, [SHARED_USER_ID]);
    await client.query(`insert into ophanim_organization_memberships (organization_id, user_id, role)
      values ($1, $2, 'owner') on conflict (organization_id, user_id) do update set role = 'owner'`, [SHARED_ORGANIZATION_ID, SHARED_USER_ID]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function getSharedWorkspaceActor(): Promise<AuthenticatedActor> {
  // Keyless map and provider tools work without a database. Persisted features
  // continue to report their normal DATABASE_URL requirement when it is absent.
  if (process.env.DATABASE_URL) {
    if (!provisioning) provisioning = provision().catch(error => { provisioning = undefined; throw error; });
    await provisioning;
  }
  return { userId: SHARED_USER_ID, organizationId: SHARED_ORGANIZATION_ID, role: 'owner',
    email: '', displayName: 'Shared workspace', authProvider: 'shared' };
}
