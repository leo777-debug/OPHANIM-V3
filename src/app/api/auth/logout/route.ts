import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, revokeSession, SESSION_COOKIE } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { trustedRequestOrigin } from '@/lib/http/request-origin';

export async function POST(request: NextRequest) {
  if (!trustedRequestOrigin(request)) return NextResponse.json({ error: 'Cross-origin logout is not permitted.' }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) return NextResponse.json({ error: 'Sign out could not be confirmed. Please retry.' }, { status: 503 });
    } catch {
      return NextResponse.json({ error: 'Sign out could not be confirmed. Please retry.' }, { status: 503 });
    }
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
