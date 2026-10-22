import type { NormalizedIntelligenceEvent } from '@/lib/intelligence/event-provider';
import { distanceKm } from '@/lib/intelligence/analysis';
import type { Point, SeaRoute } from './open-network';

function bearing(a: Point, b: Point) { const rad = Math.PI / 180, left = a[1] * rad, right = b[1] * rad, delta = (b[0] - a[0]) * rad; return Math.atan2(Math.sin(delta) * Math.cos(right), Math.cos(left) * Math.sin(right) - Math.sin(left) * Math.cos(right) * Math.cos(delta)); }
const distance = (a: Point, b: Point) => distanceKm({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] });
export function pointToSeaRouteKm(point: Point, route: Point[]) {
  if (!route.length) return Infinity; if (route.length === 1) return distance(point, route[0]);
  let best = Infinity;
  for (let index = 1; index < route.length; index++) {
    const a = route[index - 1], b = route[index], segment = distance(a, b) / 6371.0088;
    const delta = distance(a, point) / 6371.0088, angle = bearing(a, point) - bearing(a, b);
    const cross = Math.asin(Math.max(-1, Math.min(1, Math.sin(delta) * Math.sin(angle))));
    const along = Math.atan2(Math.sin(delta) * Math.cos(angle), Math.cos(delta));
    best = Math.min(best, along < 0 || along > segment ? Math.min(distance(point, a), distance(point, b)) : Math.abs(cross) * 6371.0088);
  }
  return best;
}
export function eventsAlongRoute(events: NormalizedIntelligenceEvent[], route: SeaRoute, radiusKm = 100) {
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 1000) throw new Error('Route context radius must be 1–1000 km.');
  return events.flatMap(event => {
    const { latitude, longitude } = event.location;
    if (event.organizationScope !== null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const distanceKm = pointToSeaRouteKm([longitude!, latitude!], route.coordinates);
    return distanceKm <= radiusKm ? [{ event, distanceKm, label: 'Nearby public observation; no operational impact inferred' }] : [];
  });
}
export function closureScenario(baseline: SeaRoute, alternative: SeaRoute | null, closedDays: number) {
  if (!Number.isFinite(closedDays) || closedDays < 1 || closedDays > 365) throw new Error('Closure must be 1–365 days.');
  const rerouteExtraDays = alternative ? Math.max(0, alternative.days - baseline.days) : null;
  return { label: 'SCENARIO · model, not fact', closedDays, waitingExtraDays: closedDays, rerouteExtraDays,
    modeledExtraDays: rerouteExtraDays === null ? closedDays : Math.min(closedDays, rerouteExtraDays),
    calculation: 'Waiting adds closure days. Rerouting adds max(0, alternative sea days − baseline sea days). Indicative minimum is the smaller. No queue, cargo handling, road/rail, customs or reopening backlog is included.',
    options: [{ name: 'Wait for reopening', extraDays: closedDays }, ...(rerouteExtraDays === null ? [] : [{ name: 'Use alternative sea path', extraDays: rerouteExtraDays }])],
  };
}
