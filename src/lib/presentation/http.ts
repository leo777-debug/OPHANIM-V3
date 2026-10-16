import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';

export class PresentationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(process.env.APP_URL ?? request.url).origin; } catch { return false; }
}
export async function presentationAdmin(request: NextRequest) {
  if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request)) throw new PresentationError('Cross-origin changes are not permitted.', 403);
  // Single-founder presentation setup: retain the existing owner/admin policy.
  return requireAuthenticatedActor(request, 'organization:manage');
}
export async function presentationBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PresentationError('JSON is required.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new PresentationError('Request body is required.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new PresentationError('Request is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PresentationError('Invalid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PresentationError('JSON object required.');
  return body as Record<string, unknown>;
}
export function presentationFailure(error: unknown) {
  const status = error instanceof PresentationError ? error.status : error instanceof OrganizationAccessError ? (error.message === 'Authentication is required.' ? 401 : 403) : 503;
  return NextResponse.json({ error: error instanceof PresentationError ? error.message : status === 401 ? 'Sign in to continue.' : status === 403 ? 'Owner/admin access is required.' : 'Presentation settings are temporarily unavailable.' }, { status, headers: { 'Cache-Control': 'no-store' } });
}
