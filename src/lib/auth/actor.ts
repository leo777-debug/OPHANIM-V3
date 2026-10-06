import type { NextRequest } from 'next/server';
import { db } from '@/lib/watchlists/db';
import { OrganizationAccessError, requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hashSessionToken, ORGANIZATION_COOKIE, SESSION_COOKIE } from './session';

export interface AuthenticatedActor extends OrganizationActor {
  email: string;
  displayName: string | null;
  authProvider: 'supabase' | 'legacy';
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

async function getSupabaseActor(request: NextRequest): Promise<AuthenticatedActor | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const authUserId = !error && typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  if (!authUserId) return null;

  const selectedOrganization = request.cookies.get(ORGANIZATION_COOKIE)?.value;
  const result = await db().query<{
    user_id: string; organization_id: string; role: AuthenticatedActor['role']; email: string; display_name: string | null;
  }>(
    `select u.id as user_id, m.organization_id, m.role, coalesce(u.email, '') as email, u.display_name
     from ophanim_users u
     join ophanim_organization_memberships m on m.user_id = u.id
     where u.auth_user_id = $1
       and ($2::uuid is null or m.organization_id = $2)
     order by case m.role when 'owner' then 0 when 'operations_manager' then 1 when 'analyst' then 2 else 3 end,
       m.created_at
     limit 1`,
    [authUserId, isUuid(selectedOrganization) ? selectedOrganization : null],
  );
  const row = result.rows[0];
  return row ? {
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role,
    email: row.email,
    displayName: row.display_name,
    authProvider: 'supabase',
  } : null;
}

export async function getAuthenticatedActor(request: NextRequest): Promise<AuthenticatedActor | null> {
  const supabaseActor = await getSupabaseActor(request);
  if (supabaseActor) return supabaseActor;
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
  return { userId: row.user_id, organizationId: row.organization_id, role: row.role, email: row.email, displayName: row.display_name, authProvider: 'legacy' };
}

export async function requireAuthenticatedActor(request: NextRequest, permission?: Parameters<typeof requireOrganizationAccess>[2]): Promise<AuthenticatedActor> {
  const actor = await getAuthenticatedActor(request);
  if (!actor) throw new OrganizationAccessError('Authentication is required.');
  if (permission) requireOrganizationAccess(actor, actor.organizationId, permission);
  return actor;
}
