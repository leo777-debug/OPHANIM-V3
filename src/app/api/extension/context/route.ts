import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { loadExtensionContext } from '@/lib/extension/context';
import { ExtensionContextValidationError, validateExtensionContextInput } from '@/lib/extension/validation';

function permittedExtensionOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin?.startsWith('chrome-extension://')) return null;
  const allowedIds = new Set((process.env.OPHANIM_EXTENSION_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  const extensionId = origin.slice('chrome-extension://'.length).replace(/\/$/, '');
  if (allowedIds.has(extensionId) || process.env.NODE_ENV !== 'production') return origin;
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
  try {
    const actor = await requireAuthenticatedActor(request, 'shipment:read');
    const input = validateExtensionContextInput(await request.json());
    return withExtensionHeaders(request, NextResponse.json(await loadExtensionContext(actor, input)));
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : error instanceof ExtensionContextValidationError || error instanceof SyntaxError ? 400 : 500;
    return withExtensionHeaders(request, NextResponse.json({ error: error instanceof Error ? error.message : 'Extension context request failed.' }, { status }));
  }
}
