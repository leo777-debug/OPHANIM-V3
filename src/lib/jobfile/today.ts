// The Today list: one prioritised list per person and team. Priority = probability × cost.
// At most ALERT_BUDGET interruptions per person per day; everything else waits in the list.
import type { Ctx } from './types';

export type TodayKind = 'flag' | 'missing_milestone' | 'confirm_document' | 'review_request' | 'chaser' | 'deadline' | 'intake_review';
export type TodayItem = {
  id: string; jobFileId: string | null; kind: TodayKind; titleEn: string; titleAr: string; probability: number | null; cost: number | null; priority: number; dueAt: string | null;
  assigneeUserId: string | null; team: string | null; state: 'open' | 'done' | 'snoozed' | 'escalated' | 'not_a_problem'; snoozedUntil: string | null; interrupt: boolean; payload: Record<string, unknown>; sourceKey: string; createdAt: string; updatedAt: string;
};
export const ALERT_BUDGET = Number(process.env.JOBFILE_ALERT_BUDGET || 5);
export const priorityOf = (probability: number | null, cost: number | null) => Math.round((probability ?? 1) * (cost ?? 100) * 100) / 100;

/** Create or refresh an item by its source key; a person's decision (done, snoozed…) is never overwritten. */
export async function upsertTodayItem(ctx: Ctx, item: Pick<TodayItem, 'kind' | 'titleEn' | 'titleAr' | 'sourceKey'> & Partial<Pick<TodayItem, 'jobFileId' | 'probability' | 'cost' | 'dueAt' | 'assigneeUserId' | 'team' | 'payload'>>) {
  const organizationId = ctx.actor.organizationId;
  const [existing] = await ctx.repo.select<TodayItem>('ophanim_today_items', organizationId, { sourceKey: item.sourceKey });
  const fields = { jobFileId: item.jobFileId ?? null, kind: item.kind, titleEn: item.titleEn, titleAr: item.titleAr, probability: item.probability ?? null, cost: item.cost ?? null,
    priority: priorityOf(item.probability ?? null, item.cost ?? null), dueAt: item.dueAt ?? null, assigneeUserId: item.assigneeUserId ?? null, team: item.team ?? null, payload: item.payload ?? {} };
  if (existing) return (await ctx.repo.update<TodayItem>('ophanim_today_items', organizationId, { id: existing.id }, { ...fields, payload: { ...existing.payload, ...fields.payload } }))[0];
  return ctx.repo.insert<TodayItem>('ophanim_today_items', organizationId, { ...fields, sourceKey: item.sourceKey, state: 'open', interrupt: false });
}
export async function closeTodayItem(ctx: Ctx, sourceKey: string) {
  await ctx.repo.update('ophanim_today_items', ctx.actor.organizationId, { sourceKey, state: 'open' }, { state: 'done' });
}
