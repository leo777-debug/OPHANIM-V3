import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, revokeSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signInRequired } from '@/lib/auth/access-mode';

export async function POST(request: NextRequest) {
  if (!signInRequired()) return clearSessionCookie(NextResponse.json({ ok: true, sharedWorkspace: true }));
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut().catch(() => undefined);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
