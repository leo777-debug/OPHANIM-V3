import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { recordPrediction } from './ledger';
import { memoryRepo } from './repo';
import { ALERT_BUDGET, upsertTodayItem, type TodayItem } from './today';
import { actOnToday, rankToday } from './today-list';
import type { Ctx } from './types';

const ORG = '00000000-0000-4000-8000-0000000000b7';

describe('Today list', () => {
  it('ranks by probability × cost, caps interruptions per person per day, and keeps the rest waiting', async () => {
    let now = Date.parse('2026-10-24T05:00:00Z');
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u1', role: 'analyst', demo: false }, now: () => now };
    for (let index = 0; index < 9; index++) await upsertTodayItem(ctx, { kind: 'flag', sourceKey: `k${index}`, titleEn: `Item ${index}`, titleAr: 'عنصر', probability: 0.1 * (index + 1), cost: 1000 });
    await upsertTodayItem(ctx, { kind: 'confirm_document', sourceKey: 'small', titleEn: 'Small', titleAr: 'صغير', probability: 1, cost: 20 });
    const first = await rankToday(ctx);
    expect(first.items[0].titleEn).toBe('Item 8'); expect(first.items.at(-1)!.titleEn).toBe('Small');
    expect(first.interruptions).toBe(ALERT_BUDGET); expect(first.waiting).toBe(10 - ALERT_BUDGET);
    await upsertTodayItem(ctx, { kind: 'flag', sourceKey: 'late', titleEn: 'Late urgent', titleAr: 'عاجل', probability: 1, cost: 5000 });
    expect((await rankToday(ctx)).interruptions).toBe(ALERT_BUDGET); // budget already used today
    // A colleague has their own budget: my view did not spend it.
    const colleague = await rankToday({ ...ctx, actor: { ...ctx.actor, userId: 'u2' } });
    expect(colleague.interruptions).toBe(ALERT_BUDGET); expect(colleague.items[0].titleEn).toBe('Late urgent');
    // Re-raising the same source refreshes it without undoing a person's decision.
    const [item] = await ctx.repo.select<TodayItem>('ophanim_today_items', ORG, { sourceKey: 'k8' });
    await actOnToday(ctx, item.id, 'snooze', 2);
    expect((await rankToday(ctx)).items.some(row => row.id === item.id)).toBe(false);
    now += 3 * 36e5;
    expect((await rankToday(ctx)).items.some(row => row.id === item.id)).toBe(true);
  });

  it('records acting on, or dismissing, a time-gap warning on its prediction', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u1', role: 'analyst', demo: false } };
    const { forecast } = await recordPrediction(ctx, { questionType: 'time_gap_risk', outcomeKind: 'binary', subjectKey: 'gap:job1:terminal_received', jobFileId: 'job1', textEn: 'Terminal receipt confirmed in time', probability: 0.8, modelVersion: 'time-gap@1', inputs: { a: 1 } });
    const item = await upsertTodayItem(ctx, { kind: 'missing_milestone', jobFileId: 'job1', sourceKey: 'missing:job1:terminal_received', titleEn: 'Missing', titleAr: 'مفقود', payload: { code: 'terminal_received' } });
    await actOnToday(ctx, item.id, 'escalate');
    expect((await ctx.repo.select<{ kind: string; action: string }>('ophanim_forecast_interactions', ORG, { forecastId: forecast.id }))[0]).toMatchObject({ kind: 'acted', action: 'escalate' });
  });
});
