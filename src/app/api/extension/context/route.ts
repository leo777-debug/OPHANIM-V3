import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError, requireOrganizationAccess } from '@/lib/operations/authorization';
import { loadExtensionContext } from '@/lib/extension/context';
import { ExtensionContextValidationError, validateExtensionContextInput } from '@/lib/extension/validation';
import { trustedRequestOrigin } from '@/lib/http/request-origin';
import { limitedRequestBytes, RequestBodyLimitError } from '@/lib/http/limited-form-data';

function permittedExtensionOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin || !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return null;
  const allowedIds = new Set((process.env.OPHANIM_EXTENSION_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  const extensionId = origin.slice('chrome-extension://'.length);
  if (allowedIds.has(extensionId)) return origin;
  return null;
}

function withExtensionHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const origin = permittedExtensionOrigin(request);
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

export function OPTIONS(request: NextRequest) {
  const origin = permittedExtensionOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Vary', 'Origin');
  return response;
}

export async function POST(request: NextRequest) {
  if (!permittedExtensionOrigin(request) && !trustedRequestOrigin(request)) return NextResponse.json({ error: 'This browser origin is not permitted.' }, { status: 403 });
  try {
    // Read-only context is the narrow extension exception; no global mutation
    // guard is relaxed, and the request still needs an authenticated membership.
    const actor = await getAuthenticatedActor(request);
    if (!actor) throw new OrganizationAccessError('Authentication is required.');
    requireOrganizationAccess(actor, actor.organizationId, 'shipment:read');
    const input = validateExtensionContextInput(JSON.parse(Buffer.from(await limitedRequestBytes(request, 32 * 1024)).toString('utf8')));
    return withExtensionHeaders(request, NextResponse.json(await loadExtensionContext(actor, input)));
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : error instanceof RequestBodyLimitError ? 413 : error instanceof ExtensionContextValidationError || error instanceof SyntaxError ? 400 : 500;
    return withExtensionHeaders(request, NextResponse.json({ error: 'Extension context request failed.' }, { status }));
  }
}
