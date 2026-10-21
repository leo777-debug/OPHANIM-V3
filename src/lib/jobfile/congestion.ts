// Congestion and delays on each job's own dates and places: airport weather
// (TAF/METAR rules), City Pulse (road rules/curfews), Gate Pulse (driver taps →
// waiting time per site) and port/carrier notices from the provider registry.
// Messages lead with the impact and say FACT or ESTIMATE.
import { createHash, randomBytes } from 'node:crypto';
import { makeFlag, type Flag } from './checks';
import { recordPrediction } from './ledger';
import { audit, JobFileInputError, saveFlags, type JobAggregate } from './service';
import type { Ctx, JobFile } from './types';

// ---- Airport weather --------------------------------------------------------------
export const IATA_TO_ICAO: Record<string, string> = { DXB: 'OMDB', DWC: 'OMDW', AUH: 'OMAA', SHJ: 'OMSJ', RKT: 'OMRK', FJR: 'OMFJ', AAN: 'OMAL', DOH: 'OTHH', BAH: 'OBBI', KWI: 'OKKK', MCT: 'OOMS', RUH: 'OERK', JED: 'OEJN', DMM: 'OEDF' };
export type WeatherGroup = { kind: 'base' | 'FM' | 'TEMPO' | 'BECMG' | 'PROB'; probability: number; from: number; to: number; visibilityM: number | null; windKt: number | null; gustKt: number | null; phenomena: string[] };
function dayHour(token: string, issued: Date) {
  const day = Number(token.slice(0, 2)), hour = Number(token.slice(2, 4)), minute = token.length >= 6 ? Number(token.slice(4, 6)) : 0;
  const date = new Date(Date.UTC(issued.getUTCFullYear(), issued.getUTCMonth(), day, hour, minute));
  if (day < issued.getUTCDate() - 15) date.setUTCMonth(date.getUTCMonth() + 1);
  return date.getTime();
}
/** Parse a TAF into time-bounded groups (base, FM, TEMPO, BECMG, PROBxx). */
export function parseTaf(raw: string, issuedAt: string): { station: string | null; groups: WeatherGroup[] } {
  const text = raw.replace(/\s+/g, ' ').trim(), issued = new Date(issuedAt), station = text.match(/\b(?:TAF(?: AMD| COR)? )?([A-Z]{4}) \d{6}Z/)?.[1] ?? null;
  const parts = text.split(/\s(?=FM\d{6}\b|TEMPO\b|BECMG\b|PROB\d{2}\b)/);
  const validity = text.match(/\b(\d{4})\/(\d{4})\b/), end = validity ? dayHour(validity[2], issued) : issued.getTime() + 30 * 36e5;
  const groups: WeatherGroup[] = [];
  parts.forEach((part, index) => {
    const kind: WeatherGroup['kind'] = index === 0 ? 'base' : part.startsWith('FM') ? 'FM' : part.startsWith('TEMPO') ? 'TEMPO' : part.startsWith('BECMG') ? 'BECMG' : 'PROB';
    const period = part.match(/\b(\d{4})\/(\d{4})\b/), fm = part.match(/^FM(\d{6})/);
    const from = fm ? dayHour(fm[1], issued) : period ? dayHour(period[1], issued) : issued.getTime(), to = period && !fm ? dayHour(period[2], issued) : end;
    const wind = part.match(/\b(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/), vis = part.match(/(?:^|\s)(\d{4})(?=\s|$)/g)?.map(value => Number(value.trim())).find(value => value <= 9999 && !(period && part.includes(`${value}/`)));
    groups.push({ kind, probability: kind === 'PROB' ? Number(part.match(/PROB(\d{2})/)![1]) / 100 * (part.includes('TEMPO') ? 0.6 : 1) : kind === 'TEMPO' ? 0.6 : 1, from, to,
      visibilityM: vis ?? (/\bCAVOK\b/.test(part) ? 10000 : null), windKt: wind ? Number(wind[1]) : null, gustKt: wind?.[2] ? Number(wind[2]) : null,
      phenomena: [...part.matchAll(/(?:^|\s)[+-]?(?:VC)?((?:BL|DR|MI|BC|FZ)?(?:FG|BR|DU|SA|DS|SS|HZ|TS|RA|SH|PO))(?=\s|$)/g)].map(match => match[1]) });
  });
  return { station, groups };
}
export type WeatherRisk = { code: 'weather_fog' | 'weather_visibility' | 'weather_wind' | 'weather_dust'; probability: number; from: number; to: number; detail: Record<string, string | number> };
/** Simple rules: fog, low visibility, strong wind/gusts, dust or sand. */
export function weatherRisks(groups: WeatherGroup[], windowStart: number, windowEnd: number): WeatherRisk[] {
  const risks = new Map<WeatherRisk['code'], WeatherRisk>();
  for (const group of groups.filter(item => item.from < windowEnd && item.to > windowStart)) {
    const add = (code: WeatherRisk['code'], detail: WeatherRisk['detail']) => { const current = risks.get(code); if (!current || current.probability < group.probability) risks.set(code, { code, probability: group.probability, from: Math.max(group.from, windowStart), to: Math.min(group.to, windowEnd), detail }); };
    const fog = group.phenomena.some(item => item.endsWith('FG')) || (group.phenomena.includes('BR') && (group.visibilityM ?? 9999) < 1000);
    if (fog) add('weather_fog', { visibility: group.visibilityM ?? 'n/a' });
    else if (group.visibilityM !== null && group.visibilityM < 1500) add('weather_visibility', { visibility: group.visibilityM });
    if ((group.windKt ?? 0) >= 25 || (group.gustKt ?? 0) >= 35) add('weather_wind', { wind: Math.max(group.windKt ?? 0, group.gustKt ?? 0) });
    if (group.phenomena.some(item => /DU|SA|DS|SS/.test(item))) add('weather_dust', {});
  }
  return [...risks.values()];
}
const window = (from: number, to: number) => `${new Date(from).toISOString().slice(11, 16)}–${new Date(to).toISOString().slice(11, 16)} UTC ${new Date(from).toISOString().slice(0, 10)}`;
type WeatherRow = { station: string; kind: 'metar' | 'taf'; raw: string; issuedAt: string; source: string; isSynthetic: boolean };

/** Weather flags and a logged weather-impact prediction for an air job's arrival (or departure) morning. */
export async function weatherForJob(ctx: Ctx, aggregate: JobAggregate): Promise<{ flags: Flag[]; lines: ConditionLine[] }> {
  const { job } = aggregate;
  if (!job.mode.startsWith('air')) return { flags: [], lines: [] };
  const importing = job.mode === 'air_import', code = (importing ? job.destination : job.origin)?.trim().toUpperCase() ?? '', at = Date.parse((importing ? job.plannedArrivalAt : job.plannedDepartureAt) ?? '');
  const station = code.length === 4 ? code : IATA_TO_ICAO[code];
  if (!station || !Number.isFinite(at)) return { flags: [], lines: [] };
  const [taf] = await ctx.repo.select<WeatherRow>('ophanim_airport_weather', ctx.actor.organizationId, { station, kind: 'taf' }, { shared: true, order: 'issuedAt desc', limit: 1 });
  if (!taf) return { flags: [], lines: [] };
  const risks = weatherRisks(parseTaf(taf.raw, taf.issuedAt).groups, at - 3 * 36e5, at + 3 * 36e5);
  const source = `ESTIMATE from TAF ${station} issued ${taf.issuedAt.slice(0, 16).replace('T', ' ')} UTC (${taf.source}${taf.isSynthetic ? ', SYNTHETIC DEMO' : ''}).`;
  const flags = risks.map(risk => makeFlag(risk.code, 'warn', `${risk.code}:${job.id}:${station}:${taf.issuedAt}`, { station: code || station, window: window(risk.from, risk.to), source, ...risk.detail }));
  if (risks.length && importing) {
    const probability = Math.min(0.9, Math.max(...risks.map(risk => risk.probability * (risk.code === 'weather_fog' ? 0.6 : risk.code === 'weather_visibility' ? 0.4 : 0.3))));
    await recordPrediction(ctx, { questionType: 'weather_impact', outcomeKind: 'binary', subjectKey: `weather:${job.id}:arrival`, jobFileId: job.id, resolveBy: new Date(at + 48 * 36e5).toISOString(),
      textEn: `${job.jobNumber}: arrival at ${code} at least 60 minutes later than planned because of weather`, probability, modelVersion: 'weather-rules@1',
      inputs: { station, taf: taf.raw, issuedAt: taf.issuedAt, plannedArrivalAt: job.plannedArrivalAt, risks: risks.map(risk => risk.code) }, drivers: risks.map(risk => ({ label: risk.code, value: risk.probability })), trigger: 'taf' });
  }
  return { flags, lines: risks.map(risk => ({ title: `${risk.code.replace('weather_', '')} risk at ${code || station} on your ${importing ? 'arrival' : 'departure'} morning`, label: 'ESTIMATE' as const, detail: `${window(risk.from, risk.to)}. ${source}` })) };
}

// ---- City Pulse --------------------------------------------------------------------
export type CityPulseEvent = { id: string; emirate: string; kind: string; titleEn: string; titleAr: string; startsAt: string | null; endsAt: string | null; weekly: { days: number[]; from: string; to: string } | null; appliesTo: 'truck' | 'all'; isSynthetic: boolean };
const EMIRATES: Array<[RegExp, string]> = [[/\b(DXB|DWC|JEBEL ALI|JEA|DUBAI|PORT RASHID)\b/i, 'Dubai'], [/\b(SHJ|SHARJAH|KHOR FAKKAN|KLF)\b/i, 'Sharjah'], [/\b(AUH|ABU DHABI|KHALIFA PORT)\b/i, 'Abu Dhabi'], [/\b(FJR|FUJAIRAH)\b/i, 'Fujairah'], [/\b(RKT|RAS AL KHAIMAH)\b/i, 'Ras Al Khaimah'], [/\b(AJMAN)\b/i, 'Ajman'], [/\b(UMM AL QUWAIN|UAQ)\b/i, 'Umm Al Quwain']];
export const emirateOf = (place?: string | null) => EMIRATES.find(([pattern]) => pattern.test(place ?? ''))?.[1] ?? null;
const dubaiParts = (at: number) => { const local = new Date(at + 4 * 36e5); return { day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), date: local.toISOString().slice(0, 10) }; };
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export function cityPulseHits(events: CityPulseEvent[], emirate: string | null, at: number) {
  if (!emirate) return [];
  const local = dubaiParts(at);
  return events.filter(event => event.emirate === emirate && (event.startsAt && event.endsAt ? at >= Date.parse(event.startsAt) && at <= Date.parse(event.endsAt) : event.weekly ? event.weekly.days.includes(local.day) && local.minutes >= minutes(event.weekly.from) && local.minutes <= minutes(event.weekly.to) : false));
}
async function cityPulseForJob(ctx: Ctx, aggregate: JobAggregate): Promise<{ flags: Flag[]; lines: ConditionLine[] }> {
  const { job } = aggregate, truck = aggregate.legs.filter(leg => leg.mode === 'road');
  const delivery = aggregate.milestones.find(item => ['delivered', 'collected', 'arrived_destination'].includes(item.code) && !item.actualAt && (item.expectedAt || item.plannedAt));
  const at = Date.parse(delivery?.expectedAt ?? delivery?.plannedAt ?? truck[0]?.plannedArrivalAt ?? '');
  if (!Number.isFinite(at) || (!truck.length && !['air_import', 'sea_import', 'road', 'multimodal'].includes(job.mode))) return { flags: [], lines: [] };
  const emirate = emirateOf(truck[0]?.toLocation ?? job.destination);
  const events = await ctx.repo.select<CityPulseEvent>('ophanim_city_pulse_events', ctx.actor.organizationId, {}, { shared: true });
  const hits = cityPulseHits(events, emirate, at);
  return { flags: hits.map(hit => makeFlag('city_pulse', 'warn', `city_pulse:${job.id}:${hit.id}:${dubaiParts(at).date}`, { title: hit.titleEn + (hit.isSynthetic ? ' (SYNTHETIC DEMO)' : ''), date: dubaiParts(at).date })),
    lines: hits.map(hit => ({ title: `${hit.titleEn} affects your truck leg`, label: 'FACT' as const, detail: `${emirate}, ${dubaiParts(at).date}${hit.isSynthetic ? ' · SYNTHETIC DEMO calendar entry' : ''}` })) };
}

// ---- Gate Pulse: driver links and waiting time ----------------------------------------
type DriverLink = { id: string; jobFileId: string; legId: string | null; siteId: string | null; tokenSha256: string; driverLabel: string | null; locationOptIn: boolean; expiresAt: string; revokedAt: string | null };
type SiteEvent = { id: string; siteId: string | null; jobFileId: string | null; driverLinkId: string | null; event: 'arrived' | 'loaded' | 'left'; at: string };
const tokenHash = (secret: string) => createHash('sha256').update(secret).digest('hex');
/** One link per truck leg; no app install. The token carries the organization so lookups stay tenant-scoped. */
export async function createDriverLink(ctx: Ctx, jobFileId: string, input: { siteId?: string | null; legId?: string | null; driverLabel?: string | null; locationOptIn?: boolean; hours?: number }) {
  const secret = randomBytes(24).toString('base64url'), token = `${ctx.actor.organizationId}.${secret}`;
  const link = await ctx.repo.insert<DriverLink>('ophanim_driver_links', ctx.actor.organizationId, { jobFileId, legId: input.legId ?? null, siteId: input.siteId ?? null, tokenSha256: tokenHash(secret), driverLabel: input.driverLabel?.slice(0, 80) ?? null,
    locationOptIn: Boolean(input.locationOptIn), expiresAt: new Date((ctx.now?.() ?? Date.now()) + Math.min(72, Math.max(1, input.hours ?? 24)) * 36e5).toISOString() });
  await audit(ctx, 'driver_link.created', 'job_file', jobFileId, { linkId: link.id, locationOptIn: link.locationOptIn });
  return { link, path: `/d/${token}` };
}
export async function resolveDriverLink(ctx: Pick<Ctx, 'repo' | 'now'>, token: string) {
  const [organizationId, secret] = token.split('.');
  if (!/^[0-9a-f-]{36}$/i.test(organizationId ?? '') || !secret || secret.length < 20) return null;
  const [link] = await ctx.repo.select<DriverLink>('ophanim_driver_links', organizationId, { tokenSha256: tokenHash(secret) });
  if (!link || link.revokedAt || Date.parse(link.expiresAt) < (ctx.now?.() ?? Date.now())) return null;
  return { organizationId, link };
}
/** Arrived / Loaded / Left. Location is stored only if the link allows it and the driver ticked consent. */
export async function driverTap(ctx: Ctx, link: DriverLink, input: { event: 'arrived' | 'loaded' | 'left'; latitude?: number; longitude?: number; consent?: boolean; photoDocumentId?: string | null }) {
  if (!['arrived', 'loaded', 'left'].includes(input.event)) throw new JobFileInputError('Unknown event.');
  const location = link.locationOptIn && input.consent && Number.isFinite(input.latitude) && Number.isFinite(input.longitude) && Math.abs(input.latitude!) <= 90 && Math.abs(input.longitude!) <= 180;
  const event = await ctx.repo.insert<SiteEvent>('ophanim_site_events', ctx.actor.organizationId, { siteId: link.siteId, jobFileId: link.jobFileId, driverLinkId: link.id, event: input.event, at: new Date(ctx.now?.() ?? Date.now()).toISOString(),
    latitude: location ? Math.round(input.latitude! * 1e4) / 1e4 : null, longitude: location ? Math.round(input.longitude! * 1e4) / 1e4 : null, photoDocumentId: input.photoDocumentId ?? null });
  await audit(ctx, `driver.${input.event}`, 'job_file', link.jobFileId, { siteId: link.siteId, location: Boolean(location) });
  return event;
}
/** Waiting time per site by hour of the week (arrived → left on the same trip), Gulf time. */
export function siteWaits(events: SiteEvent[]) {
  const trips = new Map<string, { arrived?: number; left?: number }>();
  for (const event of events) { if (!event.driverLinkId) continue; const trip = trips.get(event.driverLinkId) ?? {}; if (event.event === 'arrived') trip.arrived ??= Date.parse(event.at); if (event.event === 'left') trip.left = Date.parse(event.at); trips.set(event.driverLinkId, trip); }
  const buckets = new Map<number, number[]>(), all: number[] = [];
  for (const trip of trips.values()) {
    if (!trip.arrived || !trip.left || trip.left <= trip.arrived) continue;
    const wait = (trip.left - trip.arrived) / 6e4, local = dubaiParts(trip.arrived), bucket = local.day * 24 + Math.floor(local.minutes / 60);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), wait]); all.push(wait);
  }
  const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };
  return { trips: all.length, overallMinutes: median(all), byHourOfWeek: Object.fromEntries([...buckets.entries()].map(([bucket, values]) => [bucket, { minutes: median(values)!, trips: values.length }])), median };
}
export const formatWait = (minutes: number) => minutes >= 2880 ? `~${Math.round(minutes / 1440)} days` : `~${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}`;
export async function currentWait(ctx: Ctx, siteId: string) {
  const events = await ctx.repo.select<SiteEvent>('ophanim_site_events', ctx.actor.organizationId, { siteId }, { order: 'at desc', limit: 5000 });
  const waits = siteWaits(events), local = dubaiParts(ctx.now?.() ?? Date.now()), bucket = waits.byHourOfWeek[local.day * 24 + Math.floor(local.minutes / 60)];
  const value = bucket ?? (waits.overallMinutes !== null ? { minutes: waits.overallMinutes, trips: waits.trips } : null);
  return value ? { minutes: value.minutes, trips: value.trips, text: `Current wait at this gate: ${formatWait(value.minutes)} (ESTIMATE from ${value.trips} trip${value.trips === 1 ? '' : 's'}${bucket ? ' at this hour of the week' : ''})` } : null;
}

// ---- Port and carrier notices (existing provider registry → ophanim_events) --------------
type EventRow = { id: string; title: string; description: string | null; eventType: string; category: string; eventStatus: string; occurredAt: string | null; updatedAt: string; metadata: Record<string, unknown> };
export function eventsForJob(events: EventRow[], job: JobFile, places: string[], now: number) {
  const tokens = [...new Set([job.origin, job.destination, ...places].filter((value): value is string => Boolean(value && value.trim().length >= 3)).map(value => value.trim().toUpperCase()))];
  const from = Date.parse(job.plannedDepartureAt ?? '') || now - 7 * 864e5, to = (Date.parse(job.plannedArrivalAt ?? '') || now) + 3 * 864e5;
  return events.filter(event => ['active', 'monitoring'].includes(event.eventStatus) && tokens.some(token => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(`${event.title} ${event.description ?? ''}`))
    && Date.parse(event.occurredAt ?? event.updatedAt) <= to && Date.parse(event.updatedAt) >= from - 2 * 864e5);
}

export type ConditionLine = { title: string; label: 'FACT' | 'ESTIMATE'; detail: string };
/** All outside conditions for one job: saves weather/City Pulse flags and returns impact-first lines. */
export async function jobConditions(ctx: Ctx, aggregate: JobAggregate) {
  const org = ctx.actor.organizationId, weather = await weatherForJob(ctx, aggregate), city = await cityPulseForJob(ctx, aggregate);
  await saveFlags(ctx, aggregate.job.id, [...weather.flags, ...city.flags], { replaceCodes: ['weather_fog', 'weather_visibility', 'weather_wind', 'weather_dust', 'city_pulse'] });
  const lines: ConditionLine[] = [...weather.lines, ...city.lines];
  const siteIds = [...new Set((await ctx.repo.select<DriverLink>('ophanim_driver_links', org, { jobFileId: aggregate.job.id })).map(link => link.siteId).filter((id): id is string => Boolean(id)))];
  for (const siteId of siteIds) { const wait = await currentWait(ctx, siteId); const [site] = await ctx.repo.select<{ name: string }>('ophanim_sites', org, { id: siteId }, { shared: true }); if (wait) lines.push({ title: `${site?.name ?? 'Gate'}: ${wait.text.replace(' (ESTIMATE', ' (').replace(/^Current wait at this gate: /, 'current wait ')}`, label: 'ESTIMATE', detail: wait.text }); }
  const events = await ctx.repo.select<EventRow>('ophanim_events', org, {}, { shared: true, order: 'updatedAt desc', limit: 500 });
  for (const event of eventsForJob(events, aggregate.job, aggregate.legs.flatMap(leg => [leg.fromLocation ?? '', leg.toLocation ?? '']), ctx.now?.() ?? Date.now()).slice(0, 5))
    lines.push({ title: `Notice on your route: ${event.title}`, label: 'FACT', detail: `${event.category} · reported ${(event.occurredAt ?? event.updatedAt).slice(0, 16).replace('T', ' ')} UTC` });
  return lines;
}
