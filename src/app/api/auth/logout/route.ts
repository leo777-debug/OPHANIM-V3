import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, revokeSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut().catch(() => undefined);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
