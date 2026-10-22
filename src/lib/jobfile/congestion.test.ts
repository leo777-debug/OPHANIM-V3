import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { presentationDestination } from '@/lib/presentation/policy';
import { cityPulseHits, createDriverLink, currentWait, driverTap, eventsForJob, jobConditions, parseTaf, resolveDriverLink, siteWaits, weatherRisks } from './congestion';
import { memoryRepo } from './repo';
import { createJobFile, loadJob } from './service';
import type { Ctx, JobFile } from './types';

const ORG = '00000000-0000-4000-8000-0000000000a9', H = 36e5;
const TAF = 'TAF OMDB 230500Z 2306/2412 32008KT 6000 NSC TEMPO 2400/2404 0800 FG BECMG 2405/2407 34012KT 9999 NSW';

describe('congestion on the job’s own dates and places', () => {
  it('parses TAF groups and applies fog, wind and dust rules', () => {
    const { station, groups } = parseTaf(TAF, '2026-10-23T05:00:00Z');
    expect(station).toBe('OMDB'); expect(groups.map(group => group.kind)).toEqual(['base', 'TEMPO', 'BECMG']);
    expect(groups[1]).toMatchObject({ visibilityM: 800, phenomena: ['FG'], from: Date.parse('2026-10-24T00:00:00Z'), to: Date.parse('2026-10-24T04:00:00Z') });
    expect(weatherRisks(groups, Date.parse('2026-10-24T01:00:00Z'), Date.parse('2026-10-24T05:00:00Z')).map(risk => risk.code)).toEqual(['weather_fog']);
    const windy = parseTaf('TAF OMDB 230500Z 2306/2412 31028G40KT 3000 DU', '2026-10-23T05:00:00Z').groups;
    expect(weatherRisks(windy, Date.parse('2026-10-23T08:00:00Z'), Date.parse('2026-10-23T09:00:00Z')).map(risk => risk.code).sort()).toEqual(['weather_dust', 'weather_wind']);
  });

  it('a seeded fog TAF at DXB flags an air-import job arriving that morning and logs a weather prediction', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true }, now: () => Date.parse('2026-10-23T12:00:00Z') };
    await ctx.repo.insert('ophanim_airport_weather', ORG, { station: 'OMDB', kind: 'taf', raw: TAF, issuedAt: '2026-10-23T05:00:00.000Z', source: 'SYNTHETIC DEMO feed', isSynthetic: true });
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-6001', destination: 'DXB', plannedArrivalAt: '2026-10-24T02:30:00Z' });
    const lines = await jobConditions(ctx, (await loadJob(ctx, job.id))!);
    const flag = (await loadJob(ctx, job.id))!.flags.find(item => item.checkCode === 'weather_fog')!;
    expect(flag.messageEn).toMatch(/^Fog risk at DXB on your arrival morning/); expect(flag.messageEn).toContain('ESTIMATE'); expect(flag.messageAr).toContain('ضباب');
    expect(lines[0]).toMatchObject({ label: 'ESTIMATE' });
    expect((await ctx.repo.select('ophanim_forecast_questions', ORG, { questionType: 'weather_impact' }))).toHaveLength(1);
    // A sea job or a different day is not flagged.
    const other = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-6002', destination: 'DXB', plannedArrivalAt: '2026-10-24T14:00:00Z' });
    await jobConditions(ctx, (await loadJob(ctx, other.id))!);
    expect((await loadJob(ctx, other.id))!.flags).toEqual([]);
  });

  it('driver taps produce a wait-time figure for the site; location only with consent on an opt-in link', async () => {
    let now = Date.parse('2026-10-20T06:00:00Z');
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true }, now: () => now };
    const site = await ctx.repo.insert<{ id: string }>('ophanim_sites', ORG, { type: 'gate', name: 'SYNTHETIC Gate 3', emirate: 'Dubai' });
    const job = await createJobFile(ctx, { mode: 'road', jobNumber: 'JF-6003' });
    for (const [index, wait] of [150, 170, 160].entries()) {
      const { path } = await createDriverLink(ctx, job.id, { siteId: site.id, locationOptIn: index === 0 });
      const resolved = (await resolveDriverLink(ctx, path.slice(3)))!;
      now = Date.parse('2026-10-20T06:00:00Z') + index * 7 * 24 * H;
      const arrived = await driverTap(ctx, resolved.link, { event: 'arrived', latitude: 25.01, longitude: 55.06, consent: index === 0 });
      expect(Boolean((await ctx.repo.select<{ id: string; latitude: number | null }>('ophanim_site_events', ORG, { id: arrived.id }))[0].latitude)).toBe(index === 0);
      now += wait * 6e4; await driverTap(ctx, resolved.link, { event: 'left', latitude: 25, longitude: 55, consent: false });
    }
    expect(siteWaits(await ctx.repo.select('ophanim_site_events', ORG)).trips).toBe(3);
    now = Date.parse('2026-11-10T06:20:00Z');
    const wait = (await currentWait(ctx, site.id))!;
    expect(wait.minutes).toBe(160); expect(wait.text).toBe('Current wait at this gate: ~2h40 (ESTIMATE from 3 trips at this hour of the week)');
    expect(await resolveDriverLink(ctx, `${ORG}.not-a-real-token-value-xx`)).toBeNull();
    now = Date.parse('2026-12-31T00:00:00Z');
    const expired = await createDriverLink({ ...ctx, now: () => Date.parse('2026-10-01T00:00:00Z') }, job.id, {});
    expect(await resolveDriverLink(ctx, expired.path.slice(3))).toBeNull();
  });

  it('applies City Pulse to truck legs and matches notices to the job’s places and dates', () => {
    const curfew = { id: 'c', emirate: 'Dubai', kind: 'truck_curfew', titleEn: 'Truck restriction (example)', titleAr: 'x', startsAt: null, endsAt: null, weekly: { days: [1], from: '06:30', to: '09:00' }, appliesTo: 'truck' as const, isSynthetic: true };
    expect(cityPulseHits([curfew], 'Dubai', Date.parse('2026-10-19T03:30:00Z'))).toHaveLength(1); // Monday 07:30 Gulf time
    expect(cityPulseHits([curfew], 'Dubai', Date.parse('2026-10-19T06:30:00Z'))).toHaveLength(0);
    const job = { origin: 'SZX', destination: 'DXB', plannedDepartureAt: '2026-10-22T00:00:00Z', plannedArrivalAt: '2026-10-24T02:30:00Z' } as JobFile;
    const events = [{ id: '1', title: 'Cargo terminal congestion at DXB', description: null, eventType: 'notice', category: 'port', eventStatus: 'active', occurredAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z', metadata: {} },
      { id: '2', title: 'Berth closure at Port Klang', description: null, eventType: 'notice', category: 'port', eventStatus: 'active', occurredAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z', metadata: {} }];
    expect(eventsForJob(events, job, [], Date.parse('2026-10-23T12:00:00Z')).map(event => event.id)).toEqual(['1']);
  });

  it('keeps driver links reachable in Presentation mode without changing other pages', () => {
    const settings = { enabled: true } as Parameters<typeof presentationDestination>[1];
    expect(presentationDestination('/d/abc.def', settings, 'presentation' as never)).toBeNull();
    expect(presentationDestination('/jobs', settings, 'presentation' as never)).toBe('/presentation');
  });
});
