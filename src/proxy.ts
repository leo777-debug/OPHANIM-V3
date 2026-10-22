import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { refreshSupabaseSession } from '@/lib/supabase/proxy';
import { signInRequired } from '@/lib/auth/access-mode';
import { safeReturnTo } from '@/lib/auth/return-to';

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const sharedAccess = !signInRequired();
  if (sharedAccess && request.nextUrl.pathname === '/login') {
    const target = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
    const destination = new URL(target, request.url);
    if (destination.pathname === '/login' || destination.pathname.startsWith('/api/')) destination.pathname = '/operations';
    return NextResponse.redirect(destination);
  }
  const response = sharedAccess ? NextResponse.next({ request }) : await refreshSupabaseSession(request);
  const endpoint = process.env.UMAMI_ENDPOINT;
  const website = process.env.UMAMI_WEBSITE_ID;

  if (endpoint && website && !request.nextUrl.pathname.startsWith('/api/')) {
    const userAgent = request.headers.get('user-agent') || 'Unknown Ophanim Client';
    event.waitUntil(fetch(`${endpoint.replace(/\/$/, '')}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
      body: JSON.stringify({
        payload: {
          hostname: request.nextUrl.hostname,
          language: 'en-US',
          referrer: request.headers.get('referer') || '',
          screen: '1920x1080',
          title: 'OPHANIM',
          url: request.nextUrl.pathname,
          website,
        },
        type: 'event',
      }),
    }).catch(() => undefined));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
