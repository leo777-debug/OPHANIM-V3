import { describe,it,expect } from 'vitest';
import { corridorDistance } from './corridor';
import { buildSeaGraph,routeOnGraph,exploreSeaRoute } from './open-network';
describe('Route Lens corridor and licensed network',()=>{
 it('filters segments, endpoints and the date line',()=>{
  expect(corridorDistance([1,.1],[[0,0],[2,0]])).toBeCloseTo(11.12,1);
  expect(corridorDistance([1,2],[[0,0],[2,0]])).toBeGreaterThan(200);
  expect(corridorDistance([180,.1],[[179,0],[-179,0]])).toBeLessThan(12);
  expect(corridorDistance([3,0],[[0,0],[2,0]])).toBeGreaterThan(100);
 });
 it('finds alternative graph paths and does not route through a closed passage',()=>{
  const g=buildSeaGraph({features:[{properties:{passage:'ormuz'},geometry:{type:'LineString',coordinates:[[0,0],[1,0]]}},{geometry:{type:'LineString',coordinates:[[0,0],[0,2],[1,0]]}}]});
  const a=routeOnGraph(g,[0,0],[1,0])!,b=routeOnGraph(g,[0,0],[1,0],{closed:['ormuz']})!;
  expect(b.distanceKm).toBeGreaterThan(a.distanceKm);expect(b.passages).toEqual([]);
 });
 it('loads the actual reference graph for Gulf shipment legs',async()=>{
  const route=await exploreSeaRoute([55.06,25],[56.36,25.17]);
  expect(route.baseline?.coordinates.length).toBeGreaterThan(2);
  expect(route.baseline?.assumptions.join(' ')).toContain('not navigational');
 });
});
