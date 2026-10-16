import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { verifyPassword } from '@/lib/auth/passwords';
import { createSession, setOrganizationCookie, setSessionCookie } from '@/lib/auth/session';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/watchlists/db';
import { trustedRequestOrigin } from '@/lib/http/request-origin';
import { limitedRequestBytes, RequestBodyLimitError } from '@/lib/http/limited-form-data';

export async function POST(request: NextRequest) {
  if (!trustedRequestOrigin(request)) return NextResponse.json({ error: 'Cross-origin sign-in is not permitted.' }, { status: 403 });
  const limited = () => NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429, headers: { 'Retry-After': '60' } });
  if (isRateLimited(`auth:login:ip:${getClientIp(request)}`, 10, 60_000)) return limited();
  let body: { email?: unknown; password?: unknown; organizationSlug?: unknown } | null;
  try {
    body = JSON.parse(Buffer.from(await limitedRequestBytes(request, 8 * 1024)).toString('utf8'));
  } catch (error) {
    return error instanceof RequestBodyLimitError
      ? NextResponse.json({ error: 'Sign-in request is too large.' }, { status: 413 })
      : NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || typeof body.email !== 'string' || typeof body.password !== 'string' || typeof body.organizationSlug !== 'string') {
    return NextResponse.json({ error: 'Email, password, and organization slug are required.' }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  const organizationSlug = body.organizationSlug.trim();
  if (!email || email.length > 320 || !body.password || body.password.length > 512 || !organizationSlug || organizationSlug.length > 128) {
    return NextResponse.json({ error: 'Invalid sign-in details.' }, { status: 400 });
  }
  // An account budget cannot be bypassed by rotating forwarded IPs or org slugs.
  const account = createHash('sha256').update(email).digest('hex');
  if (isRateLimited(`auth:login:account:${account}`, 10, 60_000)) return limited();
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
