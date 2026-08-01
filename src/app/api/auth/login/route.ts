import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth/passwords';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { db } from '@/lib/watchlists/db';

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 10, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  let body: { email?: unknown; password?: unknown; organizationSlug?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (typeof body.email !== 'string' || typeof body.password !== 'string' || typeof body.organizationSlug !== 'string') {
    return NextResponse.json({ error: 'Email, password, and organization slug are required.' }, { status: 400 });
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
      [body.email.trim(), body.organizationSlug.trim()],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(body.password, user.password_hash))) return NextResponse.json({ error: 'Invalid sign-in details.' }, { status: 401 });
    const token = await createSession(client, user.user_id, user.organization_id);
    return setSessionCookie(NextResponse.json({ ok: true }), token);
  } finally {
    client.release();
  }
}
