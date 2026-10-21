import { afterEach,describe,it,expect,vi } from 'vitest';
import { parseRoadInput,routeRoadLeg } from './road';
const input={side:'origin',from:{label:'Public depot',lat:25,lon:55},to:{label:'Public gate',lat:25.01,lon:55.01},truck:{height:4,width:2.5,length:16.5,weight:32,hazmat:false}};
afterEach(()=>vi.unstubAllEnvs());
describe('truck road planning',()=>{
 it('requires selected endpoints and explicit truck restrictions',()=>{
  expect(parseRoadInput(input).truck.weight).toBe(32);
  expect(()=>parseRoadInput({...input,truck:undefined})).toThrow('hazardous');
  expect(()=>parseRoadInput({...input,to:{label:'invalid',lat:91,lon:55}})).toThrow('endpoint');
  expect(()=>parseRoadInput({...input,from:input.to})).toThrow('distinct');
 });
 it('withholds when an internal router is absent',async()=>{
  vi.stubEnv('ROAD_ROUTER_URL','');
  await expect(routeRoadLeg(parseRoadInput(input))).rejects.toThrow('not configured');
 });
 it('uses truck costing and validates snapped geometry without re-streaming a public demo',async()=>{
  vi.stubEnv('ROAD_ROUTER_URL','http://road-router:8002');
  const mock=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({code:'Ok',routes:[{distance:2000,duration:300,geometry:{type:'LineString',coordinates:[[55,25],[55.005,25.005],[55.01,25.01]]}}]})));
  const leg=await routeRoadLeg(parseRoadInput(input),mock);
  const sent=JSON.parse(mock.mock.calls[0][1]!.body as string);
  expect(sent.costing).toBe('truck');expect(sent.costing_options.truck.weight).toBe(32);
  expect(leg).toMatchObject({distanceKm:2,durationHours:300/3600,provider:'valhalla'});
  expect(leg.caveat).toContain('No live traffic');
  mock.mockResolvedValue(new Response(JSON.stringify({code:'Ok',routes:[{distance:2000,duration:300,geometry:{type:'LineString',coordinates:[[55,25],[56,26]]}}]})));
  await expect(routeRoadLeg(parseRoadInput(input),mock)).rejects.toThrow('snapping exceeds');
 });
});
