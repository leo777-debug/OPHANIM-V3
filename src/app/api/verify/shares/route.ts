import { NextRequest } from 'next/server';
import { createShare, readRun, revokeShare } from '@/lib/verify/store';
import { errorResponse, jsonResponse, readBody, requestContext, VerifyHttpError } from '@/lib/verify/http';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try { const { actor, owner } = await requestContext(request, true); const body = await readBody(request);
    if (body.publicConsent !== true) throw new VerifyHttpError('Confirm that your claim contains no private or organization data.', 400);
    const result = await readRun(String(body.id ?? ''), actor, owner);
    if (!result) throw new VerifyHttpError('Check not found in your session/history.', 404);
    const share = await createShare(result, actor, owner);
    return jsonResponse({ ...share, path: `/verify/shared/${share.token}` }, owner);
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: NextRequest) {
  try { const { actor, owner } = await requestContext(request, true); const body = await readBody(request);
    await revokeShare(String(body.token ?? ''), actor, owner); return jsonResponse({ revoked: true }, owner);
  } catch (error) { return errorResponse(error); }
}
