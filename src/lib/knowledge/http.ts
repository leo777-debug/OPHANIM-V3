import { NextResponse, type NextRequest } from 'next/server';
import { OrganizationAccessError } from '@/lib/operations/authorization';

export function knowledgeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Knowledge request failed.';
  const status = error instanceof OrganizationAccessError ? 403 : /DATABASE_URL|Private storage|runtime missing/.test(message) ? 503 : 400;
  return NextResponse.json({ error: /password|connection string|postgres:\/\//i.test(message) ? 'Knowledge service unavailable.' : message },{status});
}
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin && origin !== process.env.APP_URL?.replace(/\/$/,'')) throw new OrganizationAccessError('Cross-origin writes are not permitted.');
}
export function cronAuthorized(request: NextRequest) { return Boolean(process.env.KNOWLEDGE_CRON_SECRET) && request.headers.get('authorization')===`Bearer ${process.env.KNOWLEDGE_CRON_SECRET}`; }
