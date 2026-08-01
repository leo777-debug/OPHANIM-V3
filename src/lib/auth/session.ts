import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { NextResponse } from 'next/server';
import { db } from '@/lib/watchlists/db';

export const SESSION_COOKIE = 'ophanim_session';

function sessionDays(): number {
  const configured = Number(process.env.OPHANIM_SESSION_DAYS ?? 30);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 1), 90) : 30;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(client: PoolClient, userId: string, organizationId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await client.query(
    `insert into ophanim_sessions (user_id, organization_id, token_hash, expires_at)
     values ($1, $2, $3, now() + ($4 || ' days')::interval)`,
    [userId, organizationId, hashSessionToken(token), String(sessionDays())],
  );
  return token;
}

export function setSessionCookie<T>(response: NextResponse<T>, token: string): NextResponse<T> {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionDays() * 24 * 60 * 60,
  });
  return response;
}

export function clearSessionCookie<T>(response: NextResponse<T>): NextResponse<T> {
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}

export async function revokeSession(token: string): Promise<void> {
  await db().query(`update ophanim_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`, [hashSessionToken(token)]);
}
