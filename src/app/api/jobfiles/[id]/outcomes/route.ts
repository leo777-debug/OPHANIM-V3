import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { resolvePaperRisk } from '@/lib/jobfile/receipts';
import { audit, JobFileInputError } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

/** Record what happened to the paperwork: a customs query, amendment, rejection or invoice dispute. */
export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const id = (await params).id, body = await boundedJson(request, 2000).catch(() => null) as { kind?: string; note?: string } | null;
  if (!['customs_query', 'amendment', 'rejection', 'invoice_dispute'].includes(body?.kind ?? '')) throw new JobFileInputError('kind must be customs_query, amendment, rejection or invoice_dispute.');
  const resolved = await resolvePaperRisk(ctx, id, true, { kind: body!.kind, note: body?.note?.slice(0, 500) ?? null });
  await audit(ctx, 'paperwork.outcome', 'job_file', id, { kind: body!.kind });
  return { resolved: Boolean(resolved) };
});
