import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation, query } from '@/lib/jobfile/context';
import { can } from '@/lib/operations/authorization';
import { JobFileInputError } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

/** Organization settings for job files: sites (gates, terminals…) and the City Pulse calendar. */
export const GET = (request: NextRequest) => query(request, 'shipment:read', async ctx => ({
  sites: await ctx.repo.select('ophanim_sites', ctx.actor.organizationId, {}, { shared: true, order: 'name' }),
  cityPulse: await ctx.repo.select('ophanim_city_pulse_events', ctx.actor.organizationId, {}, { shared: true, order: 'emirate' }),
}));

const SITE_TYPES = ['gate', 'terminal', 'warehouse', 'border', 'port', 'airport'], KINDS = ['truck_curfew', 'road_rule', 'event', 'closure', 'holiday'];
const time = (value: unknown) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : null;
export const POST = (request: NextRequest) => mutation(request, 'shipment:write', async ctx => {
  if (!ctx.actor.demo && !can(ctx.actor, 'jobfile:approve')) throw new JobFileInputError('Only an owner or operations manager can change these settings.');
  const body = await boundedJson(request, 4000).catch(() => null) as Record<string, unknown> | null, org = ctx.actor.organizationId;
  if (body?.action === 'add_site' && SITE_TYPES.includes(String(body.type)) && typeof body.name === 'string' && body.name.trim())
    return { site: await ctx.repo.insert('ophanim_sites', org, { type: body.type, name: body.name.trim().slice(0, 160), code: typeof body.code === 'string' ? body.code.slice(0, 16) : null, emirate: typeof body.emirate === 'string' ? body.emirate.slice(0, 40) : null }) };
  if (body?.action === 'add_city_pulse' && KINDS.includes(String(body.kind)) && typeof body.emirate === 'string' && typeof body.titleEn === 'string') {
    const days = Array.isArray(body.days) ? body.days.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [];
    const weekly = days.length && time(body.from) && time(body.to) ? { days, from: time(body.from), to: time(body.to) } : null;
    const startsAt = typeof body.startsAt === 'string' && Number.isFinite(Date.parse(body.startsAt)) ? new Date(body.startsAt).toISOString() : null, endsAt = typeof body.endsAt === 'string' && Number.isFinite(Date.parse(body.endsAt)) ? new Date(body.endsAt).toISOString() : null;
    if (!weekly && !(startsAt && endsAt)) throw new JobFileInputError('Give weekly days and from/to times, or a start and end.');
    return { event: await ctx.repo.insert('ophanim_city_pulse_events', org, { emirate: body.emirate.slice(0, 40), kind: body.kind, titleEn: body.titleEn.slice(0, 200), titleAr: typeof body.titleAr === 'string' && body.titleAr ? body.titleAr.slice(0, 200) : body.titleEn.slice(0, 200), weekly, startsAt, endsAt, appliesTo: body.appliesTo === 'all' ? 'all' : 'truck', sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 500) : null, isSynthetic: ctx.actor.demo }) };
  }
  if (body?.action === 'remove_city_pulse' && typeof body.id === 'string') return { removed: await ctx.repo.remove('ophanim_city_pulse_events', org, { id: body.id }) };
  throw new JobFileInputError('Unknown settings action.');
});
