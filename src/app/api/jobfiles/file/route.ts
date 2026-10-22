import { NextResponse, type NextRequest } from 'next/server';
import { headers, jobContext, jobError } from '@/lib/jobfile/context';
import { getFile, verifySignature } from '@/lib/jobfile/storage';
export const dynamic = 'force-dynamic';

/** Serves a private file only with a valid unexpired signature AND a session in the file's organization. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams, key = params.get('key') ?? '';
    if (!verifySignature(key, Number(params.get('expires')), params.get('signature') ?? '')) return NextResponse.json({ error: 'Link expired.' }, { status: 403, headers });
    const ctx = await jobContext(request, 'shipment:read');
    if (!key.startsWith(`${ctx.actor.organizationId}/`)) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
    const [document] = await ctx.repo.select<{ mimeType: string; originalFileName: string }>('ophanim_documents', ctx.actor.organizationId, { storagePath: key });
    if (!document) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
    return new NextResponse(new Uint8Array(await getFile(key, ctx.actor.demo)), { headers: { ...headers, 'Content-Type': document.mimeType,
      'Content-Disposition': `inline; filename="${document.originalFileName.replace(/[^\w.-]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox" } });
  } catch (error) { return jobError(error); }
}
