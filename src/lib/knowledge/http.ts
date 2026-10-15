import { NextResponse, type NextRequest } from 'next/server';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { trustedRequestOrigin } from '@/lib/http/request-origin';
import { limitedRequestBytes, RequestBodyLimitError } from '@/lib/http/limited-form-data';
import { KnowledgeInputError, knowledgeFailureMessage } from './errors';

export function knowledgeError(error: unknown) {
  const status = error instanceof OrganizationAccessError ? 403 : error instanceof RequestBodyLimitError ? 413 : error instanceof KnowledgeInputError || error instanceof SyntaxError ? 400 : 503;
  const message = error instanceof OrganizationAccessError ? 'Access is not permitted.' : error instanceof RequestBodyLimitError ? 'Knowledge request is too large.' : error instanceof SyntaxError ? 'Invalid request JSON.' : knowledgeFailureMessage(error);
  return NextResponse.json({ error: message },{status,headers:{'Cache-Control':'no-store'}});
}
export async function readKnowledgeBody(request: NextRequest): Promise<Record<string, unknown>> {
  const value = JSON.parse(Buffer.from(await limitedRequestBytes(request, 32 * 1024)).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new KnowledgeInputError('A JSON object is required.');
  return value;
}
export function documentPage(request: NextRequest) {
  const limit=request.nextUrl.searchParams.get('limit') ?? '100', offset=request.nextUrl.searchParams.get('offset') ?? '0';
  if(!/^\d+$/.test(limit) || !/^\d+$/.test(offset))throw new KnowledgeInputError('Invalid document page.');
  return {limit:Number(limit),offset:Number(offset)};
}
export function assertSameOrigin(request: NextRequest) {
  if (!trustedRequestOrigin(request)) throw new OrganizationAccessError('Cross-origin writes are not permitted.');
}
export function cronAuthorized(request: NextRequest) { return Boolean(process.env.KNOWLEDGE_CRON_SECRET) && request.headers.get('authorization')===`Bearer ${process.env.KNOWLEDGE_CRON_SECRET}`; }
