import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const endpoint = process.env.UMAMI_ENDPOINT;
  const website = process.env.UMAMI_WEBSITE_ID;
  if (!endpoint || !website) return NextResponse.next();

  const url = request.nextUrl.pathname;
  const userAgent = request.headers.get('user-agent') || 'Unknown Ophanim Client';
  
  const basePayload = {
    hostname: request.nextUrl.hostname,
    language: "en-US",
    referrer: request.headers.get('referer') || "",
    screen: "1920x1080",
    title: "OPHANIM",
    url: url,
    website,
  };

  const pageView = fetch(`${endpoint.replace(/\/$/, '')}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
    body: JSON.stringify({ payload: basePayload, type: "event" })
  }).catch(() => {});

  event.waitUntil(pageView);

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
