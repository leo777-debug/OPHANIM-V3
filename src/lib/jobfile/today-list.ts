// Ranking and actions for the Today list. Interruptions are capped per person per
// day (ALERT_BUDGET); everything else waits in the list, ranked by probability × cost.
import { recordInteraction, type Forecast, type Question } from './ledger';
import { audit, JobFileInputError, userOf } from './service';
import { ALERT_BUDGET, type TodayItem } from './today';
import type { Ctx } from './types';

const DAY = 864e5;
/** Rank open items; soon-due items move up. Marks the top items as interruptions until the person's daily budget is used. */
export async function rankToday(ctx: Ctx, options: { scope: 'me' | 'team' } = { scope: 'me' }) {
  const org = ctx.actor.organizationId, now = ctx.now?.() ?? Date.now(), me = userOf(ctx);
  const all = await ctx.repo.select<TodayItem>('ophanim_today_items', org, {}, { limit: 2000 });
  const visible = all.filter(item => (item.state === 'open' || item.state === 'escalated' || (item.state === 'snoozed' && item.snoozedUntil && Date.parse(item.snoozedUntil) <= now))
    && (options.scope === 'team' || !item.assigneeUserId || item.assigneeUserId === me));
  const score = (item: TodayItem) => item.priority * (item.dueAt ? (Date.parse(item.dueAt) < now ? 2 : Date.parse(item.dueAt) - now < 4 * 36e5 ? 1.5 : 1) : 1) * (item.state === 'escalated' ? 1.5 : 1);
  const ranked = [...visible].sort((a, b) => score(b) - score(a));
  const today = new Date(now).toISOString().slice(0, 10);
  const used = all.filter(item => item.interrupt && item.updatedAt.slice(0, 10) === today && (item.assigneeUserId ?? null) === (options.scope === 'me' ? me : item.assigneeUserId)).length;
  let budget = Math.max(0, ALERT_BUDGET - used);
  for (const item of ranked) {
    if (budget <= 0) break;
    if (item.interrupt || item.priority < 100) continue;
    await ctx.repo.update('ophanim_today_items', org, { id: item.id }, { interrupt: true }); item.interrupt = true; budget--;
  }
  return { items: ranked, interruptions: ranked.filter(item => item.interrupt).length, waiting: ranked.filter(item => !item.interrupt).length, budget: ALERT_BUDGET };
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
  return { ok: true, within: action === 'snooze' ? DAY : 0 };
}
