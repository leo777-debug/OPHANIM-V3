import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { VERIFY_CONFIG } from './types';
import { isSchemaPendingError, SCHEMA_PENDING_MESSAGE } from '@/lib/db/schema-pending';

export const SESSION_COOKIE = 'ophanim_verify_session';
export class VerifyHttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function requestContext(request: NextRequest, mutation = false) {
  if (mutation) {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) throw new VerifyHttpError('Cross-origin requests are not permitted.', 403);
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new VerifyHttpError('Cross-site requests are not permitted.', 403);
    if (isRateLimited(`verify:ip:${getClientIp(request)}`, VERIFY_CONFIG.ratePerIp)) throw new VerifyHttpError('Too many checks. Try again in a minute.', 429);
  }
  const actor = process.env.DATABASE_URL ? await getAuthenticatedActor(request) : null;
  if (mutation && actor && isRateLimited(`verify:user:${actor.userId}`, VERIFY_CONFIG.ratePerUser)) throw new VerifyHttpError('User check limit reached.', 429);
  const old = request.cookies.get(SESSION_COOKIE)?.value;
  const owner = old && /^[0-9a-f]{64}$/.test(old) ? old : randomBytes(32).toString('hex');
  return { actor, owner };
}
export function jsonResponse(body: unknown, owner?: string) {
  const response = NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  if (owner) response.cookies.set(SESSION_COOKIE, owner, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/verify', maxAge: 1800 });
  return response;
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new VerifyHttpError('JSON body required.', 415);
  if (Number(request.headers.get('content-length') ?? 0) > VERIFY_CONFIG.maxRequestBytes) throw new VerifyHttpError('Request is too large.', 413);
  const reader = request.body?.getReader(); if (!reader) throw new VerifyHttpError('Request body required.', 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > VERIFY_CONFIG.maxRequestBytes) { await reader.cancel(); throw new VerifyHttpError('Request is too large.', 413); } chunks.push(value); } } finally { reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VerifyHttpError('JSON object required.', 400);
  return body as Record<string, unknown>;
}
export function errorResponse(error: unknown) {
  if (isSchemaPendingError(error)) return NextResponse.json({ error: SCHEMA_PENDING_MESSAGE, setupPending: true }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Check unavailable.' }, { status: error instanceof VerifyHttpError ? error.status : 400, headers: { 'Cache-Control': 'no-store' } });
}
