import { NextRequest, NextResponse } from 'next/server';
import { publicSnapshot, readRun, readShare } from '@/lib/verify/store';
import { resultImage } from '@/lib/verify/image';
import { errorResponse, readBody, requestContext, VerifyHttpError } from '@/lib/verify/http';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
export const runtime = 'nodejs';
function png(bytes: Buffer) { return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="ophanim-verify.png"', 'Cache-Control': 'no-store' } }); }
export async function POST(request: NextRequest) {
  try { const { actor, owner } = await requestContext(request, true); const body = await readBody(request);
    const result = await readRun(String(body.id ?? ''), actor, owner); if (!result) throw new VerifyHttpError('Check not found.', 404);
    return png(await resultImage(publicSnapshot(result)));
  } catch (error) { return errorResponse(error); }
}
export async function GET(request: NextRequest) {
  try { if (isRateLimited(`verify:image:${getClientIp(request)}`, 10)) throw new VerifyHttpError('Please try later.', 429);
    const result = await readShare(request.nextUrl.searchParams.get('token') ?? ''); if (!result) throw new VerifyHttpError('Share expired or revoked.', 404);
    return png(await resultImage(result));
  } catch (error) { return errorResponse(error); }
}
