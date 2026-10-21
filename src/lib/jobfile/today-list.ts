// Ranking and actions for the Today list. Interruptions are capped per person per
// day (ALERT_BUDGET); everything else waits in the list, ranked by probability × cost.
import { recordInteraction, type Forecast, type Question } from './ledger';
import { audit, JobFileInputError, userOf } from './service';
import { ALERT_BUDGET, type TodayItem } from './today';
import type { Ctx } from './types';

/**
 * Rank open items; soon-due items move up. The top items become this person's
 * interruptions until their own daily budget is used; the budget is recorded per
 * person on the item, so one person's view never spends another's.
 */
export async function rankToday(ctx: Ctx, options: { scope: 'me' | 'team'; persist?: boolean } = { scope: 'me' }) {
  const org = ctx.actor.organizationId, now = ctx.now?.() ?? Date.now(), me = userOf(ctx), person = me ?? ctx.actor.userId;
  const all = await ctx.repo.select<TodayItem>('ophanim_today_items', org, {}, { limit: 2000 });
  const visible = all.filter(item => (item.state === 'open' || item.state === 'escalated' || (item.state === 'snoozed' && item.snoozedUntil && Date.parse(item.snoozedUntil) <= now))
    && (options.scope === 'team' || !item.assigneeUserId || item.assigneeUserId === me));
  const score = (item: TodayItem) => item.priority * (item.dueAt ? (Date.parse(item.dueAt) < now ? 2 : Date.parse(item.dueAt) - now < 4 * 36e5 ? 1.5 : 1) : 1) * (item.state === 'escalated' ? 1.5 : 1);
  const ranked = [...visible].sort((a, b) => score(b) - score(a));
  // Counted per person per Gulf day, from when each interruption was raised for them.
  const day = (at: number) => new Date(at + 4 * 36e5).toISOString().slice(0, 10), today = day(now);
  const raisedFor = (item: TodayItem) => (item.payload.interruptedFor as Record<string, string> | undefined)?.[person];
  const interruptedToday = (item: TodayItem) => { const at = raisedFor(item); return Boolean(at && day(Date.parse(at)) === today); };
  let budget = Math.max(0, ALERT_BUDGET - all.filter(interruptedToday).length);
  for (const item of ranked) {
    if (budget <= 0) break;
    if (raisedFor(item) || item.priority < 100) continue;
    const payload = { ...item.payload, interruptedFor: { ...(item.payload.interruptedFor as Record<string, string> | undefined), [person]: new Date(now).toISOString() } };
    if (options.persist !== false) await ctx.repo.update('ophanim_today_items', org, { id: item.id }, { interrupt: true, payload });
    item.payload = payload; budget--;
  }
  const items = ranked.map(item => ({ ...item, interrupt: interruptedToday(item) }));
  return { items, interruptions: items.filter(item => item.interrupt).length, waiting: items.filter(item => !item.interrupt).length, budget: ALERT_BUDGET };
}

export type TodayAction = 'done' | 'snooze' | 'escalate' | 'not_a_problem';
export async function actOnToday(ctx: Ctx, itemId: string, action: TodayAction, snoozeHours = 4) {
  const org = ctx.actor.organizationId, [item] = await ctx.repo.select<TodayItem>('ophanim_today_items', org, { id: itemId });
  if (!item) throw new JobFileInputError('Item not found.');
  const now = ctx.now?.() ?? Date.now();
  const patch = action === 'done' ? { state: 'done' } : action === 'snooze' ? { state: 'snoozed', snoozedUntil: new Date(now + Math.min(72, Math.max(1, snoozeHours)) * 36e5).toISOString() }
    : action === 'escalate' ? { state: 'escalated', team: 'senior', assigneeUserId: null } : { state: 'not_a_problem' };
  await ctx.repo.update('ophanim_today_items', org, { id: itemId }, patch);
  // A person acting on a warning is recorded on the prediction (intervention excluded from calibration later).
  const code = typeof item.payload.code === 'string' ? item.payload.code : null;
  if (item.kind === 'missing_milestone' && item.jobFileId && code) {
    const [question] = await ctx.repo.select<Question>('ophanim_forecast_questions', org, { subjectKey: `gap:${item.jobFileId}:${code}` });
    const [forecast] = question ? await ctx.repo.select<Forecast>('ophanim_forecasts', org, { questionId: question.id }, { order: 'issuedAt desc', limit: 1 }) : [];
    if (forecast) await recordInteraction(ctx, forecast.id, action === 'not_a_problem' ? 'dismissed' : 'acted', action);
  }
  await audit(ctx, `today.${action}`, 'job_file', item.jobFileId, { itemId, kind: item.kind });
  return { ok: true };
}
