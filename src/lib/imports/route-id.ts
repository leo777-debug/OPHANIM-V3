import type { NextRequest } from 'next/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

/**
 * The import id for /api/imports/<id>/… routes, or null when it is not a UUID.
 * On Vercel the merged route function can hand this route another dynamic
 * segment's params (template/[type]), so the URL path is the fallback.
 */
export async function importIdFrom(request: NextRequest, params: Promise<{ id?: string }>): Promise<string | null> {
  const fromParams = (await params).id;
  if (fromParams && UUID.test(fromParams)) return fromParams;
  const fromPath = request.nextUrl.pathname.split('/')[3];
  return fromPath && UUID.test(fromPath) ? fromPath : null;
}
