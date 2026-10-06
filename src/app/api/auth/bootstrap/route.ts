import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, validatePassword } from '@/lib/auth/passwords';
import { createSession, setOrganizationCookie, setSessionCookie } from '@/lib/auth/session';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/watchlists/db';

interface BootstrapBody {
  token?: unknown;
  email?: unknown;
  password?: unknown;
  organizationName?: unknown;
  organizationSlug?: unknown;
  displayName?: unknown;
}

function matchesToken(value: string, expected: string): boolean {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function validSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

async function bootstrapWithSupabase(body: BootstrapBody): Promise<NextResponse | null> {
  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  if (!admin) return NextResponse.json({ error: 'Supabase bootstrap requires a backend secret key.' }, { status: 503 });
  const email = (body.email as string).trim().toLowerCase();
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() || null : null;
  const client = await db().connect();
  let authUserId: string | null = null;
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('ophanim_bootstrap'))`);
    const count = await client.query<{ count: string }>('select count(*)::text as count from ophanim_organizations');
    if (Number(count.rows[0]?.count) > 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Bootstrap has already been completed.' }, { status: 409 });
    }

    const created = await admin.auth.admin.createUser({
      email,
      password: body.password as string,
      email_confirm: true,
      user_metadata: displayName ? { display_name: displayName } : undefined,
    });
    if (created.error || !created.data.user) throw new Error('Unable to create the Supabase account.');
    authUserId = created.data.user.id;

    const organization = await client.query<{ id: string }>(
      `insert into ophanim_organizations (name, slug) values ($1, $2) returning id`,
      [(body.organizationName as string).trim(), body.organizationSlug],
    );
    const user = await client.query<{ id: string }>(
      `insert into ophanim_users (auth_user_id, external_subject, email, display_name)
       values ($1, $1::text, $2, $3) returning id`,
      [authUserId, email, displayName],
    );
    await client.query(
      `insert into ophanim_organization_memberships (organization_id, user_id, role) values ($1, $2, 'owner')`,
      [organization.rows[0].id, user.rows[0].id],
    );
    await client.query('commit');

    const signedIn = await supabase.auth.signInWithPassword({ email, password: body.password as string });
    if (signedIn.error) return NextResponse.json({ error: 'Organization created, but automatic sign-in failed.' }, { status: 500 });
    return setOrganizationCookie(NextResponse.json({ ok: true }), organization.rows[0].id);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bootstrap failed.' }, { status: 400 });
  } finally {
    client.release();
  }
}

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 10, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  const bootstrapToken = process.env.OPHANIM_BOOTSTRAP_TOKEN;
  if (!bootstrapToken) return NextResponse.json({ error: 'Bootstrap is not configured.' }, { status: 503 });
  let body: BootstrapBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (typeof body.token !== 'string' || !matchesToken(body.token, bootstrapToken)) return NextResponse.json({ error: 'Invalid bootstrap token.' }, { status: 401 });
  if (typeof body.email !== 'string' || !/^\S+@\S+\.\S+$/.test(body.email)) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  if (typeof body.organizationName !== 'string' || !body.organizationName.trim()) return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 });
  if (typeof body.organizationSlug !== 'string' || !validSlug(body.organizationSlug)) return NextResponse.json({ error: 'Organization slug is invalid.' }, { status: 400 });
  try { validatePassword(body.password); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid password.' }, { status: 400 }); }

  const supabaseResponse = await bootstrapWithSupabase(body);
  if (supabaseResponse) return supabaseResponse;

  const client = await db().connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('ophanim_bootstrap'))`);
    const count = await client.query<{ count: string }>('select count(*)::text as count from ophanim_organizations');
    if (Number(count.rows[0]?.count) > 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Bootstrap has already been completed.' }, { status: 409 });
    }
    const organization = await client.query<{ id: string }>(`insert into ophanim_organizations (name, slug) values ($1, $2) returning id`, [body.organizationName.trim(), body.organizationSlug]);
    const user = await client.query<{ id: string }>(
      `insert into ophanim_users (email, display_name, password_hash) values ($1, $2, $3) returning id`,
      [body.email.trim().toLowerCase(), typeof body.displayName === 'string' ? body.displayName.trim() || null : null, await hashPassword(body.password)],
    );
    await client.query(`insert into ophanim_organization_memberships (organization_id, user_id, role) values ($1, $2, 'owner')`, [organization.rows[0].id, user.rows[0].id]);
    const token = await createSession(client, user.rows[0].id, organization.rows[0].id);
    await client.query('commit');
    return setOrganizationCookie(setSessionCookie(NextResponse.json({ ok: true }), token), organization.rows[0].id);
  } catch (error) {
    await client.query('rollback');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bootstrap failed.' }, { status: 400 });
  } finally {
    client.release();
  }
}
