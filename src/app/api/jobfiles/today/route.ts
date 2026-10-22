import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { sameOrigin } from '@/lib/http/origin';
import { mutation, query } from '@/lib/jobfile/context';
import { JobFileInputError } from '@/lib/jobfile/service';
import { actOnToday, rankToday, type TodayAction } from '@/lib/jobfile/today-list';
export const dynamic = 'force-dynamic';

/** ?scope=me|team — one prioritised list per person and per team. */
export const GET = (request: NextRequest) => query(request, 'shipment:read', async ctx => rankToday(ctx, { scope: request.nextUrl.searchParams.get('scope') === 'team' ? 'team' : 'me', persist: sameOrigin(request) }));

export const POST = (request: NextRequest) => mutation(request, 'shipment:write', async ctx => {
  const body = await boundedJson(request, 2000).catch(() => null) as { itemId?: string; action?: string; hours?: number } | null;
  if (!body?.itemId || !['done', 'snooze', 'escalate', 'not_a_problem'].includes(body.action ?? '')) throw new JobFileInputError('itemId and action (done, snooze, escalate, not_a_problem) are required.');
  return actOnToday(ctx, body.itemId, body.action as TodayAction, body.hours);
});
