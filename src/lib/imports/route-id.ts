import type { NextRequest } from 'next/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isImportId = (value: string | null | undefined): value is string => Boolean(value && UUID.test(value));

/** The import id for /api/imports/<id>/… routes, or null when it is not a UUID (param first, URL path as fallback). */
export async function importIdFrom(request: NextRequest, params: Promise<{ id?: string }>): Promise<string | null> {
  const candidates = [(await params).id, request.nextUrl.pathname.split('/')[3]];
  return candidates.find(isImportId) ?? null;
}
