import { describe, expect, it } from 'vitest';
import { buildSeaGraph, exploreSeaRoute, findReferencePorts, routeOnGraph } from './open-network';
import { closureScenario, pointToSeaRouteKm } from './scenario';
describe('independent open-network sea routing', () => {
  it('finds the shortest graph path, closes passages and reports disconnected routes', () => {
    const graph = buildSeaGraph({ features: [
      { properties: { passage: 'suez' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] } },
      { geometry: { type: 'LineString', coordinates: [[0, 0], [0, 2], [1, 0]] } },
    ] });
    const direct = routeOnGraph(graph, [0, 0], [1, 0])!, alternative = routeOnGraph(graph, [0, 0], [1, 0], { closed: ['suez'] })!;
    expect(direct.passages[0].id).toBe('suez'); expect(alternative.distanceKm).toBeGreaterThan(direct.distanceKm);
    expect(direct.days).toBeCloseTo(direct.distanceKm / (14 * 1.852 * 24));
    expect(() => routeOnGraph(graph, [181, 0], [0, 0])).toThrow(); expect(() => routeOnGraph(graph, [0, 0], [0, 0], { speedKnots: 0 })).toThrow();
  });
  it('loads the actual pinned network and finds a Suez/Cape alternative', async () => {
    const result = await exploreSeaRoute([55.05, 24.98], [4.1, 51.95], { closed: ['suez'] });
    expect(result.baseline?.passages.some(passage => passage.id === 'suez')).toBe(true);
    expect(result.alternative?.passages.some(passage => passage.id === 'suez')).toBe(false);
    expect(result.alternative?.passages.some(passage => passage.id === 'south_africa')).toBe(true);
    expect(result.extraKm).toBeGreaterThan(1000);
    expect((await findReferencePorts('Rotterdam')).length).toBeGreaterThan(0);
  });
  it('handles mid-segment proximity, date-line geometry and transparent waiting/rerouting assumptions', async () => {
    expect(pointToSeaRouteKm([5, 0.1], [[0, 0], [10, 0]])).toBeLessThan(12);
    expect(pointToSeaRouteKm([180, 0.1], [[179, 0], [-179, 0]])).toBeLessThan(12);
    const result = await exploreSeaRoute([55.05, 24.98], [4.1, 51.95], { closed: ['suez'] });
    const scenario = closureScenario(result.baseline!, result.alternative, 7);
    expect(scenario.modeledExtraDays).toBeLessThanOrEqual(7); expect(scenario.label).toContain('model, not fact');
    expect(() => closureScenario(result.baseline!, null, -1)).toThrow();
  });
});
