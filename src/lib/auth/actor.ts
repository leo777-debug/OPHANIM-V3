import type { NextRequest } from 'next/server';
import { db } from '@/lib/watchlists/db';
import { OrganizationAccessError, requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import { hashSessionToken, SESSION_COOKIE } from './session';

export interface AuthenticatedActor extends OrganizationActor {
  email: string;
  displayName: string | null;
}

export async function getAuthenticatedActor(request: NextRequest): Promise<AuthenticatedActor | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await db().query<{
    user_id: string; organization_id: string; role: AuthenticatedActor['role']; email: string; display_name: string | null;
  }>(
    `select s.user_id, s.organization_id, m.role, u.email, u.display_name
     from ophanim_sessions s
     join ophanim_organization_memberships m on m.organization_id = s.organization_id and m.user_id = s.user_id
     join ophanim_users u on u.id = s.user_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
     limit 1`,
    [hashSessionToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  void db().query(`update ophanim_sessions set last_seen_at = now() where token_hash = $1`, [hashSessionToken(token)]).catch(() => {});
  return { userId: row.user_id, organizationId: row.organization_id, role: row.role, email: row.email, displayName: row.display_name };
}

export async function requireAuthenticatedActor(request: NextRequest, permission?: Parameters<typeof requireOrganizationAccess>[2]): Promise<AuthenticatedActor> {
  const actor = await getAuthenticatedActor(request);
  if (!actor) throw new OrganizationAccessError('Authentication is required.');
  if (permission) requireOrganizationAccess(actor, actor.organizationId, permission);
  return actor;
}
