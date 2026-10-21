import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { confirmMilestone, recordMilestone, recordPieceCount } from '@/lib/jobfile/milestones';
import { JobFileInputError } from '@/lib/jobfile/service';
import { HANDOFFS, type Handoff } from '@/lib/jobfile/types';
export const dynamic = 'force-dynamic';

/** Floor taps, confirmations and warehouse tallies. */
export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const id = (await params).id, body = await boundedJson(request, 4000).catch(() => null) as { action?: string; code?: string; at?: string; handoff?: string; pieces?: number; weightKg?: number; photoDocumentId?: string } | null;
  if (body?.action === 'confirm' && body.code) { await confirmMilestone(ctx, id, body.code); return { ok: true }; }
  if (body?.action === 'tap' && body.code) {
    const at = body.at ? Date.parse(body.at) : ctx.now?.() ?? Date.now();
    if (!Number.isFinite(at)) throw new JobFileInputError('Invalid time.');
    return recordMilestone(ctx, id, { code: body.code, actualAt: new Date(at).toISOString(), source: 'floor_tap', sourceKey: 'staff:floor', confidence: 1, evidenceDocumentId: body.photoDocumentId ?? null });
  }
  if (body?.action === 'count' && HANDOFFS.includes(body.handoff as Handoff)) return recordPieceCount(ctx, id, { handoff: body.handoff as Handoff, pieces: Number(body.pieces), weightKg: typeof body.weightKg === 'number' ? body.weightKg : null, source: body.handoff === 'warehouse_tally' ? 'warehouse_tally' : 'manual', photoDocumentId: body.photoDocumentId ?? null });
  throw new JobFileInputError('Use action "tap" or "confirm" with a milestone code, or "count" with handoff and pieces.');
});
