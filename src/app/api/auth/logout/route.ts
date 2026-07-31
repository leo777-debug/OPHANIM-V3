import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, revokeSession, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
