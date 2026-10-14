import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { trustedRequestOrigin } from '@/lib/http/request-origin';

export async function authorizeAiRequest(request: NextRequest): Promise<NextResponse<{ error: string; code: string }> | null> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!trustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin AI requests are not permitted.', code: 'FORBIDDEN' }, { status: 403, headers });
  }
  let actor;
  try { actor = await getAuthenticatedActor(request); }
  catch { return NextResponse.json({ error: 'Sign-in service unavailable. Please try again.', code: 'AUTH_UNAVAILABLE' }, { status: 503, headers }); }
  if (!actor) return NextResponse.json({ error: 'Sign in to use an AI model.', code: 'AUTH_REQUIRED' }, { status: 401, headers });
  // Shared across AI routes: changing IPs or endpoints must not reset a user's budget.
  if (isRateLimited(`ai:user:${actor.userId}`, 10, 60_000)
    || isRateLimited(`ai:ip:${getClientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'AI request limit reached. Try again in a minute.', code: 'RATE_LIMITED' }, {
      status: 429, headers: { ...headers, 'Retry-After': '60' },
    });
  }
  return null;
}
