import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, validatePassword } from '@/lib/auth/passwords';
import { createSession, setOrganizationCookie, setSessionCookie } from '@/lib/auth/session';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/watchlists/db';
import { limitedRequestBytes, RequestBodyLimitError } from '@/lib/http/limited-form-data';
import { trustedRequestOrigin } from '@/lib/http/request-origin';
import type { PoolClient } from 'pg';

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
  let committed = false;
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
    committed = true;

    const signedIn = await supabase.auth.signInWithPassword({ email, password: body.password as string });
    if (signedIn.error) return NextResponse.json({ error: 'Organization created, but automatic sign-in failed.' }, { status: 500 });
    return setOrganizationCookie(NextResponse.json({ ok: true }), organization.rows[0].id);
  } catch {
    if (committed) return NextResponse.json({ error: 'Organization created. Automatic sign-in is unavailable; use the sign-in page.' }, { status: 503 });
    await client.query('rollback').catch(() => undefined);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return NextResponse.json({ error: 'Bootstrap failed.' }, { status: 400 });
  } finally {
    client.release();
  }
}

export async function POST(request: NextRequest) {
  if (!trustedRequestOrigin(request)) return NextResponse.json({ error: 'Cross-origin setup is not permitted.' }, { status: 403 });
  if (isRateLimited(`bootstrap:${getClientIp(request)}`, 10, 60_000) || isRateLimited('bootstrap:global', 30, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  const bootstrapToken = process.env.OPHANIM_BOOTSTRAP_TOKEN;
  if (!bootstrapToken) return NextResponse.json({ error: 'Bootstrap is not configured.' }, { status: 503 });
  let body: BootstrapBody;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(await limitedRequestBytes(request, 32 * 1024)).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return NextResponse.json({ error: 'A JSON object is required.' }, { status: 400 });
    body = parsed;
  } catch (error) { return NextResponse.json({ error: error instanceof RequestBodyLimitError ? 'Setup request is too large.' : 'Invalid JSON.' }, { status: error instanceof RequestBodyLimitError ? 413 : 400 }); }
  if (typeof body.token !== 'string' || !matchesToken(body.token, bootstrapToken)) return NextResponse.json({ error: 'Invalid bootstrap token.' }, { status: 401 });
  if (typeof body.email !== 'string' || !/^\S+@\S+\.\S+$/.test(body.email)) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  if (typeof body.organizationName !== 'string' || !body.organizationName.trim()) return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 });
  if (typeof body.organizationSlug !== 'string' || !validSlug(body.organizationSlug)) return NextResponse.json({ error: 'Organization slug is invalid.' }, { status: 400 });
  try { validatePassword(body.password); } catch { return NextResponse.json({ error: 'Invalid password.' }, { status: 400 }); }

  let client: PoolClient;
  try {
    const supabaseResponse = await bootstrapWithSupabase(body);
    if (supabaseResponse) return supabaseResponse;
    client = await db().connect();
  } catch { return NextResponse.json({ error: 'Setup service is unavailable. Try again later.' }, { status: 503 }); }
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
  } catch {
    await client.query('rollback').catch(() => undefined);
    return NextResponse.json({ error: 'Bootstrap failed.' }, { status: 400 });
  } finally {
    client.release();
  }
}
