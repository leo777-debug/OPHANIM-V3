import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { distanceKm } from '@/lib/intelligence/analysis';

export type Point = [number, number]; // longitude, latitude
type Edge = { to: number; km: number; passage?: string };
type Graph = { points: Point[]; edges: Edge[][] };
type Collection = { features: Array<{ properties?: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }> };
export const MARITIME_NETWORK = {
  id: 'marnet-reference', name: 'Marnet / searoute-py reference network',
  version: '1.6.0', datasetDate: '2026-05-17', importedAt: '2026-10-19',
  commit: 'dde461382a60ff75f4577f6e06c411bc48cd7efc',
  source: 'https://github.com/genthalili/searoute-py/tree/dde461382a60ff75f4577f6e06c411bc48cd7efc/searoute/data',
  licence: 'Apache-2.0', commercialUse: 'yes', keyNeeded: false,
  attribution: 'Marnet maritime reference network distributed by Gent Halili / searoute-py contributors, based on Eurostat searoute. Apache-2.0; original licence retained.',
  rateLimits: 'Packaged reference; no runtime upstream requests', refresh: 'Quarterly review; pinned dataset version',
  sha256: '111a82d949bb949c396a69a08828781314d3afe779c07e9754c3b2834dfca415',
  purpose: 'Schematic planning and distance estimates; not navigational routing. No draft, vessel class, currents, ice, opening hours or live passage status is modeled.',
};
export const PASSAGES: Record<string, string> = { ormuz: 'Strait of Hormuz', babalmandab: 'Bab el-Mandeb', suez: 'Suez Canal', malacca: 'Strait of Malacca', panama: 'Panama Canal', gibraltar: 'Strait of Gibraltar', bosporus: 'Bosporus', south_africa: 'Cape of Good Hope' };
function validPoint(point: unknown): point is Point { return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90; }
const km = (a: Point, b: Point) => distanceKm({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] });
const normalize = (point: Point): Point => [point[0] === 180 ? -180 : point[0], point[1]];
export function buildSeaGraph(collection: Collection): Graph {
  const points: Point[] = [], edges: Edge[][] = [], ids = new Map<string, number>();
  const node = (input: Point) => { const point = normalize(input), key = `${point[0]},${point[1]}`; const existing = ids.get(key); if (existing !== undefined) return existing; const id = points.length; points.push(point); edges.push([]); ids.set(key, id); return id; };
  for (const feature of collection.features) {
    if (feature.geometry.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates)) continue;
    const line = feature.geometry.coordinates as unknown[];
    for (let index = 1; index < line.length; index++) {
      if (!validPoint(line[index - 1]) || !validPoint(line[index])) continue;
      const left = node(line[index - 1] as Point), right = node(line[index] as Point);
      const passage = typeof feature.properties?.passage === 'string' ? feature.properties.passage : undefined;
      const weight = km(points[left], points[right]);
      edges[left].push({ to: right, km: weight, passage }); edges[right].push({ to: left, km: weight, passage });
    }
  }
  if (!points.length) throw new Error('Routing reference has no valid edges.');
  return { points, edges };
}
let graphPromise: Promise<Graph> | undefined;
export function seaGraph() { return graphPromise ??= readFile(path.join(process.cwd(), 'public/reference/marnet.geojson'), 'utf8').then(text => buildSeaGraph(JSON.parse(text) as Collection)); }
type ReferencePort = { name: string; code: string; country: string; originalCountry: string; coordinates: Point };
let portPromise: Promise<ReferencePort[]> | undefined;
export async function findReferencePorts(query: string) {
  const allPorts = await (portPromise ??= readFile(path.join(process.cwd(), 'public/reference/ports.geojson'), 'utf8').then(body => {
  const collection = JSON.parse(body) as Collection;
  const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
  return collection.features.flatMap(feature => {
    const properties = feature.properties ?? {}, point = feature.geometry.coordinates;
    if (!validPoint(point)) return [];
    const name = String(properties.name ?? ''), code = String(properties.port ?? ''), originalCountry = String(properties.cty ?? '');
    let country = originalCountry;
    try { if (/^[A-Z]{2}/.test(code)) country = countryNames.of(code.slice(0, 2)) || originalCountry; } catch { /* Preserve source name when the code cannot be normalized. */ }
    return [{ name, code, country, originalCountry, coordinates: point }];
  });
  }));
  const needle = query.trim().toLowerCase();
  return allPorts.filter(port => `${port.name} ${port.code} ${port.country} ${port.originalCountry}`.toLowerCase().includes(needle)).slice(0, 30);
}

class Queue {
  values: Array<[number, number]> = [];
  push(node: number, distance: number) { const value: [number, number] = [node, distance]; this.values.push(value); let index = this.values.length - 1; while (index > 0) { const parent = Math.floor((index - 1) / 2); if (this.values[parent][1] <= distance) break; this.values[index] = this.values[parent]; index = parent; } this.values[index] = value; }
  pop(): [number, number] | undefined { if (!this.values.length) return; const first = this.values[0], last = this.values.pop()!; if (this.values.length) { let index = 0; while (2 * index + 1 < this.values.length) { let child = 2 * index + 1; if (child + 1 < this.values.length && this.values[child + 1][1] < this.values[child][1]) child++; if (this.values[child][1] >= last[1]) break; this.values[index] = this.values[child]; index = child; } this.values[index] = last; } return first; }
}
export type SeaRoute = { coordinates: Point[]; distanceKm: number; nauticalMiles: number; days: number; passages: Array<{ id: string; name: string }>; connectors: Array<{ from: Point; to: Point; distanceKm: number; mode: 'unrouted connector; not a road or sea lane' }>; assumptions: string[] };
export function routeOnGraph(graph: Graph, origin: Point, destination: Point, options: { closed?: string[]; speedKnots?: number } = {}): SeaRoute | null {
  if (!validPoint(origin) || !validPoint(destination)) throw new Error('Choose valid longitude/latitude coordinates.');
  const speed = options.speedKnots ?? 14; if (!Number.isFinite(speed) || speed < 1 || speed > 50) throw new Error('Speed must be 1–50 knots.');
  const nearest = (point: Point) => { let best = 0, distance = Infinity; graph.points.forEach((candidate, id) => { const next = km(point, candidate); if (next < distance) { best = id; distance = next; } }); return best; };
  const start = nearest(origin), end = nearest(destination), distances = new Float64Array(graph.points.length).fill(Infinity), previous = new Map<number, { from: number; edge: Edge }>(), queue = new Queue();
  const closed = new Set(['northwest', 'bering', ...(options.closed ?? [])]);
  distances[start] = 0; queue.push(start, 0);
  for (let item = queue.pop(); item; item = queue.pop()) {
    const [id, distance] = item; if (distance > distances[id]) continue; if (id === end) break;
    for (const edge of graph.edges[id]) {
      if (edge.passage && closed.has(edge.passage)) continue;
      const next = distance + edge.km; if (next >= distances[edge.to]) continue;
      distances[edge.to] = next; previous.set(edge.to, { from: id, edge }); queue.push(edge.to, next);
    }
  }
  if (!Number.isFinite(distances[end])) return null;
  const ids = [end], passageIds = new Set<string>(); let current = end;
  while (current !== start) { const step = previous.get(current); if (!step) return null; if (step.edge.passage) passageIds.add(step.edge.passage); current = step.from; ids.push(current); }
  ids.reverse();
  return { coordinates: ids.map(id => graph.points[id]), distanceKm: distances[end], nauticalMiles: distances[end] / 1.852, days: distances[end] / (speed * 1.852 * 24),
    passages: [...passageIds].map(id => ({ id, name: PASSAGES[id] ?? id })),
    connectors: [{ from: origin, to: graph.points[start], distanceKm: km(origin, graph.points[start]), mode: 'unrouted connector; not a road or sea lane' }, { from: graph.points[end], to: destination, distanceKm: km(graph.points[end], destination), mode: 'unrouted connector; not a road or sea lane' }],
    assumptions: [`Spherical edge distances; constant ${speed} knots. Days = sea km / (${speed} × 1.852 × 24).`, 'Connector distances are excluded from sea transit time. Land legs require an actual road/rail plan.', 'Arctic northwest and Bering passages excluded by default. No live passage status is implied.', MARITIME_NETWORK.purpose],
  };
}
export async function exploreSeaRoute(origin: Point, destination: Point, options: { closed?: string[]; speedKnots?: number } = {}) {
  const graph = await seaGraph(), baseline = routeOnGraph(graph, origin, destination, { speedKnots: options.speedKnots });
  const closures = options.closed ?? (baseline?.passages.some(passage => passage.id === 'suez') ? ['suez'] : []);
  const alternative = closures.length ? routeOnGraph(graph, origin, destination, { ...options, closed: closures }) : null;
  return { baseline, alternative, closures, extraKm: baseline && alternative ? alternative.distanceKm - baseline.distanceKm : null, extraDays: baseline && alternative ? alternative.days - baseline.days : null, dataset: MARITIME_NETWORK, label: 'Indicative planning model, not navigation or a predicted disruption' };
}
