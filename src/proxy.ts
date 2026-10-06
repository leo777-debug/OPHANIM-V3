import type { NextFetchEvent, NextRequest } from 'next/server';
import { refreshSupabaseSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await refreshSupabaseSession(request);
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
