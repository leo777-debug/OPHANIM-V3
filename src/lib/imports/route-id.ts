import type { NextRequest } from 'next/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

/**
 * The import id for /api/imports/<id>/… routes, or null when it is not a UUID.
 * On Vercel these handlers do not reliably receive their [id] param, so the
 * client also sends ?id=, and the URL path is the last fallback.
 */
export async function importIdFrom(request: NextRequest, params: Promise<{ id?: string }>): Promise<string | null> {
  const candidates = [(await params).id, request.nextUrl.searchParams.get('id'), request.nextUrl.pathname.split('/')[3]];
  return candidates.find((value): value is string => Boolean(value && UUID.test(value))) ?? null;
}

/** What the route saw, for the 400 response header (no secrets: only this request's own path). */
export async function importIdDebug(request: NextRequest, params: Promise<{ id?: string }>): Promise<string> {
  return JSON.stringify({ param: (await params).id ?? null, path: request.nextUrl.pathname, query: request.nextUrl.search }).slice(0, 300);
}
