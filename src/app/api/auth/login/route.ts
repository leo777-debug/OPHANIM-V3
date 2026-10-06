import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth/passwords';
import { createSession, setOrganizationCookie, setSessionCookie } from '@/lib/auth/session';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/watchlists/db';

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 10, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  let body: { email?: unknown; password?: unknown; organizationSlug?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (typeof body.email !== 'string' || typeof body.password !== 'string' || typeof body.organizationSlug !== 'string') {
    return NextResponse.json({ error: 'Email, password, and organization slug are required.' }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  const organizationSlug = body.organizationSlug.trim();
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: body.password });
    if (error || !data.user) return NextResponse.json({ error: 'Invalid sign-in details.' }, { status: 401 });
    const membership = await db().query<{ organization_id: string }>(
      `select membership.organization_id
       from ophanim_users app_user
       join ophanim_organization_memberships membership on membership.user_id = app_user.id
       join ophanim_organizations organization on organization.id = membership.organization_id
       where app_user.auth_user_id = $1 and organization.slug = $2
       limit 1`,
      [data.user.id, organizationSlug],
    );
    if (!membership.rows[0]) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: 'This account does not belong to that organization.' }, { status: 403 });
    }
    return setOrganizationCookie(NextResponse.json({ ok: true }), membership.rows[0].organization_id);
  }

  const client = await db().connect();
  try {
    const result = await client.query<{ user_id: string; organization_id: string; password_hash: string | null }>(
      `select u.id as user_id, o.id as organization_id, u.password_hash
       from ophanim_users u
       join ophanim_organization_memberships m on m.user_id = u.id
       join ophanim_organizations o on o.id = m.organization_id
       where lower(u.email) = lower($1) and o.slug = $2
       limit 1`,
      [email, organizationSlug],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(body.password, user.password_hash))) return NextResponse.json({ error: 'Invalid sign-in details.' }, { status: 401 });
    const token = await createSession(client, user.user_id, user.organization_id);
    return setOrganizationCookie(setSessionCookie(NextResponse.json({ ok: true }), token), user.organization_id);
  } finally {
    client.release();
  }
}
