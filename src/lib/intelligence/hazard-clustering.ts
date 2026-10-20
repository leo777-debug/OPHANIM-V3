import { distanceKm, normalizeTitle } from './analysis';
import type { NormalizedIntelligenceEvent } from './event-provider';

export type HazardGroup = { id: string; anchor: NormalizedIntelligenceEvent; reports: NormalizedIntelligenceEvent[]; providers: string[]; matching: 'single-source record' | 'possible same hazard'; ambiguity: string | null };
const rules: Record<string, { km: number; hours: number; named: boolean }> = {
  earthquake: { km: 50, hours: 1 / 3, named: false }, wildfire: { km: 30, hours: 48, named: true },
  volcanic_activity: { km: 50, hours: 48, named: true }, severe_storm: { km: 300, hours: 72, named: true },
  flood: { km: 30, hours: 24, named: true },
};
export const HAZARD_MATCHING_METHOD = 'Possible duplicate reports, not independent corroboration. Earthquakes: ≤50 km / 20 minutes. Wildfires: ≤30 km / 48 h; volcanoes: ≤50 km / 48 h; storms: ≤300 km / 72 h; floods: ≤30 km / 24 h. Non-seismic matches also require at least 50% Jaccard similarity among distinctive title words. One record per provider/group; compare only against its fixed anchor. Multiple possible groups stay separate and are flagged. Undated, future, private or unlocated reports cannot be merged. No transitive chaining.';
const stop = new Set(['earthquake', 'flood', 'wildfire', 'fire', 'storm', 'tropical', 'cyclone', 'hurricane', 'typhoon', 'volcano', 'volcanic', 'eruption', 'activity', 'update', 'warning', 'advisory', 'the', 'and', 'near', 'north', 'south', 'east', 'west', 'region', 'area', 'report', 'event', 'off', 'sea', 'bay', 'for', 'new', 'old', 'island', 'coast', 'coastal', 'county', 'state', 'atlantic', 'pacific', 'indian', 'ocean']);
const words = (value: string) => new Set(normalizeTitle(value).split(' ').filter(word => word.length >= 3 && !stop.has(word) && !/^\d+$/.test(word)));
const time = (event: NormalizedIntelligenceEvent) => Date.parse(event.startedAt ?? '');
function located(event: NormalizedIntelligenceEvent) {
  const { latitude, longitude } = event.location;
  return typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}
export function clusterHazards(events: NormalizedIntelligenceEvent[], now = Date.now()): HazardGroup[] {
  const groups: HazardGroup[] = [], unique = new Map<string, NormalizedIntelligenceEvent>();
  const retrieved = (event: NormalizedIntelligenceEvent) => Math.max(0, ...event.sources.map(source => Date.parse(source.retrievedAt) || 0));
  for (const event of events.filter(event => event.organizationScope === null)) {
    const key = `${event.providerId}:${event.externalId}`, previous = unique.get(key);
    if (!previous || retrieved(event) > retrieved(previous) || retrieved(event) === retrieved(previous) && JSON.stringify(event) < JSON.stringify(previous)) unique.set(key, event);
  }
  const sorted = [...unique.values()].sort((a, b) => (Number.isFinite(time(a)) ? time(a) : Infinity) - (Number.isFinite(time(b)) ? time(b) : Infinity) || a.providerId.localeCompare(b.providerId) || a.externalId.localeCompare(b.externalId));
  for (const event of sorted) {
    const identity = `${event.providerId}:${event.externalId}`;
    const rule = rules[event.eventType];
    const candidates = !rule || !located(event) || !Number.isFinite(time(event)) || time(event) > now ? [] : groups.filter(group => {
      const anchor = group.anchor;
      if (anchor.eventType !== event.eventType || group.providers.includes(event.providerId) || !located(anchor) || !Number.isFinite(time(anchor)) || time(anchor) > now) return false;
      if (Math.abs(time(event) - time(anchor)) > rule.hours * 3600000) return false;
      if (distanceKm({ lat: event.location.latitude!, lng: event.location.longitude! }, { lat: anchor.location.latitude!, lng: anchor.location.longitude! }) > rule.km) return false;
      if (rule.named) { const left = words(anchor.title), right = words(event.title), shared = [...left].filter(word => right.has(word)).length; if (!shared || shared / (left.size + right.size - shared) < 0.5) return false; }
      return true;
    });
    if (candidates.length === 1) {
      const group = candidates[0]; group.reports.push(event); group.providers.push(event.providerId); group.matching = 'possible same hazard';
    } else groups.push({ id: `hazard:${identity}`, anchor: event, reports: [event], providers: [event.providerId], matching: 'single-source record', ambiguity: candidates.length > 1 ? `${candidates.length} plausible matches; kept separate.` : null });
  }
  return groups.sort((a, b) => (Number.isFinite(time(b.anchor)) ? time(b.anchor) : 0) - (Number.isFinite(time(a.anchor)) ? time(a.anchor) : 0));
}
