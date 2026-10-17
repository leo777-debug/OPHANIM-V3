import type { NextRequest } from 'next/server';
import { db } from '@/lib/db/pool';
import type { AuthenticatedActor } from './actor';

export async function presentationDemoActor(request: NextRequest): Promise<AuthenticatedActor | null> {
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
       where d.id=1 and d.enabled and d.expires_at>now()
         and d.expires_at<=d.enabled_at+interval '24 hours'`,
    );
    const row = result.rows[0];
    return row ? { userId: row.user_id, organizationId: row.organization_id, role: 'owner',
      email: 'presenter@demo.invalid', displayName: 'Public presentation demo', authProvider: 'presentation-demo' } : null;
  } catch { return null; }
}
