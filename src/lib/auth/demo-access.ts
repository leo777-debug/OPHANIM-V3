import type { NextRequest } from 'next/server';
import { db } from '@/lib/db/pool';
import type { AuthenticatedActor } from './actor';
import { hashSessionToken, SESSION_COOKIE } from './session';

export async function presentationDemoActor(request: NextRequest): Promise<AuthenticatedActor | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const path = request.nextUrl.pathname;
  if (/^\/api\/(?:sdk|scanner|sentinel|extension)(?:\/|$)/.test(path)
    || path === '/api/dark-web/scan' || path === '/api/ai/research') return null;
  try {
    const result = await db().query<{ user_id: string; organization_id: string }>(
      `select d.user_id,d.organization_id from ophanim_private.presentation_demo_access d
       join public.ophanim_presentation_settings p on p.id=1 and p.presentation_mode
       join public.ophanim_organizations o on o.id=d.organization_id and o.slug='ophanim-presentation-demo'
       join public.ophanim_users u on u.id=d.user_id and u.external_subject='ophanim-presentation-demo'
       join public.ophanim_organization_memberships m on m.organization_id=d.organization_id
         and m.user_id=d.user_id and m.role='owner'
       join public.ophanim_sessions s on s.organization_id=d.organization_id and s.user_id=d.user_id
         and s.token_hash=$1 and s.revoked_at is null and s.expires_at>now()
       where d.id=1 and d.enabled and d.expires_at>now()
         and d.expires_at<=d.enabled_at+interval '24 hours'`,
      [hashSessionToken(token)],
    );
    const row = result.rows[0];
    return row ? { userId: row.user_id, organizationId: row.organization_id, role: 'owner',
      email: 'presenter@demo.invalid', displayName: 'Public presentation demo', authProvider: 'presentation-demo' } : null;
  } catch { return null; }
}
