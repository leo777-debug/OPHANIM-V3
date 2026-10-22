import { describe, expect, it } from 'vitest';
import { normalizePublicFeed } from './feeds';
import { atlasPresentationData, pickPublicMapPoint } from './map-adapter';
import type { PublicFeed, PresentationFeed } from './types';

const live = (feed: PublicFeed): PresentationFeed => ({ ...feed, state:'live', recordedAt:null });
const flights = () => live(normalizePublicFeed('flights', {
  commercial_flights:[{ callsign:'TEST01', lat:25, lng:52, heading:90 }],
  private_flights:[{ callsign:'TEST02', lat:24, lng:51 }],
  private_jets:[{ callsign:'TEST03', lat:23, lng:50 }],
  military_flights:[{ callsign:'TEST04', lat:22, lng:49 }],
}));

describe('original atlas public-feed adapter', () => {
  it('preserves aircraft categories and heading for the original aircraft symbols', () => {
    const atlas = atlasPresentationData({flights:flights()},new Set());
    expect(atlas.data.commercial_flights[0]).toMatchObject({callsign:'TEST01',heading:90});
    expect(atlas.data.private_flights[0].callsign).toBe('TEST02');
    expect(atlas.data.private_jets[0].callsign).toBe('TEST03');
    expect(atlas.data.military_flights[0].callsign).toBe('TEST04');
  });
  it('retains vessel type for the original hull colors and category filters', () => {
    const maritime=live(normalizePublicFeed('maritime',{ships:[{mmsi:'123',type:'tanker',heading:112,lat:26,lng:56}]}));
    const atlas=atlasPresentationData({maritime},new Set());
    expect(atlas.data.maritime_ships[0]).toMatchObject({mmsi:'123',type:'tanker',heading:112});
    expect(atlas.activeLayers.ship_tanker).toBe(true);
    expect(atlas.activeLayers.maritime).toBe(true);
  });
  it('uses the original blue cable layer, without tenant SDK or unsolicited conflict fetches', () => {
    const cables=live(normalizePublicFeed('cables',{features:[{geometry:{type:'LineString',coordinates:[[54,25],[58,24]]},properties:{name:'Reference cable'}}]}));
    const atlas=atlasPresentationData({cables},new Set());
    expect(atlas.data.submarine_cables).toHaveLength(1);
    expect(atlas.activeLayers).toMatchObject({sdk_sea:true,sdk_air:false,sdk_naval:false,conflict_zones:false});
  });
  it('honors toggles and never renders an unavailable retained feed as current', () => {
    const atlas=atlasPresentationData({flights:flights()},new Set(['flights']));
    expect(atlas.activeLayers.flights).toBe(false);
    expect(atlas.activeLayers.private).toBe(false);
    const missing=atlasPresentationData({flights:{...flights(),state:'unavailable'}},new Set());
    expect(missing.data.commercial_flights).toEqual([]);
    expect(missing.activeLayers.flights).toBe(false);
  });
  it('does not invent observation timestamps when adapting position data', () => {
    expect(atlasPresentationData({flights:flights()},new Set()).data.flight_timestamp).toBeNull();
  });
  it('retains numeric quake observation times and citations for timeline/convergence consumers', () => {
    const time = '2026-10-20T00:10:00Z';
    const earthquake = live(normalizePublicFeed('earthquakes', { earthquakes: [{ id:'q', place:'Fixture', magnitude:4, time:Date.parse(time), lat:25, lng:55, url:'https://example.invalid/quake' }] }));
    expect(atlasPresentationData({earthquakes:earthquake},new Set()).data.earthquakes[0]).toMatchObject({time:Date.parse(time),place:'Fixture',url:'https://example.invalid/quake'});
  });
  it('selects the original public evidence for details, not a lossy renderer property subset', () => {
    const project=(lng:number,lat:number)=>({x:lng*10,y:lat*10});
    expect(pickPublicMapPoint({flights:flights()},new Set(),{x:520,y:250},project,()=>false)).toMatchObject({name:'TEST01',provider:'flights',sourceUrl:'https://adsb.lol/'});
    expect(pickPublicMapPoint({flights:{...flights(),state:'unavailable'}},new Set(),{x:520,y:250},project,()=>false)).toBeNull();
    expect(pickPublicMapPoint({flights:flights()},new Set(),{x:0,y:0},project,()=>false)).toBeNull();
  });
  it('picks small symbols with a 12px hit area without querying MapLibre symbol indices', () => {
    expect(pickPublicMapPoint({flights:flights()},new Set(),{x:526,y:254},(lng,lat)=>({x:lng*10,y:lat*10}),()=>false)).toMatchObject({name:'TEST01',lng:52,lat:25});
  });
  it('never picks toggled-off layers or observations on the back of the globe', () => {
    const project=(lng:number,lat:number)=>({x:lng*10,y:lat*10});
    expect(pickPublicMapPoint({flights:flights()},new Set(['flights']),{x:520,y:250},project,()=>false)).toBeNull();
    expect(pickPublicMapPoint({flights:flights()},new Set(),{x:520,y:250},project,()=>true)).toBeNull();
  });
});
