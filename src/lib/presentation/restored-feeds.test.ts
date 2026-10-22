import {beforeEach,describe,expect,it} from 'vitest';
import {normalizePublicFeed} from './feeds';
import {atlasPresentationData} from './map-adapter';
import {regionCache,publicCameraSnapshot} from '@/app/api/cctv/region-cache';
import type {PresentationFeed} from './types';

const live=(id:PresentationFeed['id'],payload:unknown):PresentationFeed=>({...normalizePublicFeed(id,payload),state:'live',recordedAt:null});
describe('restored original public map feeds',()=>{
  it('retains validated first-observation/freshness/precision evidence while excluding private fields',()=>{
    const time='2026-10-20T00:00:00.000Z';
    const feed=live('news',{
      news:[{id:'n',title:'Fixture report',source:'USGS',published:time,coords:[25,55],coords_default:false,
        location_precision:'reported',region:'Gulf',first_seen:time,first_seen_storage:'postgres',
        source_data_mode:'stale',source_last_success:time,source_stale_since:time,apiKey:'PRIVATE'}],
      news_sources:[{name:'USGS',url:'https://example.invalid',status:'ok',count:1,checkedAt:time,latestPublished:time,
        mode:'stale',lastSuccessAt:time,staleSince:time,refresh:'Every 60 s',latencyMs:10,error:'PRIVATE ERROR'}],
    });
    expect(feed.news[0]).toMatchObject({first_seen:time,first_seen_storage:'postgres',source_data_mode:'stale',source_last_success:time,location_precision:'reported',region:'Gulf'});
    expect(feed.sources[0]).toMatchObject({mode:'stale',lastSuccessAt:time,staleSince:time,refresh:'Every 60 s',latencyMs:10});
    expect(feed.features[0].properties?.approximate_location).toBe(false);
    expect(JSON.stringify(feed)).not.toContain('PRIVATE');
    const missing=live('news',{news:[{first_seen:'bad',first_seen_storage:'private',source_data_mode:'LIVE',location_precision:'reported',coords_default:true}]});
    expect(missing.news[0].first_seen).toBeUndefined();
    expect(missing.news[0].source_data_mode).toBeUndefined();
    expect(missing.news[0].location_precision).toBe('approximate');
  });
  it('keeps ports and chokepoints separate from observed vessels and strips inferred congestion',()=>{
    const ports=live('ports',{ports:[{name:'Test port',lat:25,lng:55,volume:'LIVE: 200',congestion:'SEVERE'}]});
    const chokepoints=live('chokepoints',{chokepoints:[{name:'Test strait',lat:26,lng:56,risk:'CRITICAL'}]});
    const atlas=atlasPresentationData({ports,chokepoints},new Set());
    expect(atlas.data.maritime_ships).toEqual([]);
    expect(atlas.data.maritime_ports).toHaveLength(1);
    expect(atlas.data.maritime_chokepoints).toHaveLength(1);
    expect(ports.reference).toBe(true);
    expect(JSON.stringify([ports,chokepoints])).not.toMatch(/SEVERE|LIVE: 200|CRITICAL/);
  });
  it('does not turn a vessel layer back on when ports are visible',()=>{
    const ports=live('ports',{ports:[{name:'Test port',lat:25,lng:55}]});
    const maritime=live('maritime',{ships:[{name:'Test ship',lat:25,lng:56}]});
    const atlas=atlasPresentationData({ports,maritime},new Set(['maritime']));
    expect(atlas.activeLayers.maritime).toBe(true);
    expect(atlas.data.maritime_ports).toHaveLength(1);
    expect(atlas.data.maritime_ships).toEqual([]);
  });
  it('does not discard cameras and aircraft beyond the old 5,000-marker cutoff',()=>{
    const rows=Array.from({length:5101},(_,index)=>({id:String(index),name:`Test ${index}`,lat:25,lng:55}));
    expect(normalizePublicFeed('cameras',{cameras:rows}).features).toHaveLength(5101);
    expect(normalizePublicFeed('flights',{commercial_flights:rows}).features).toHaveLength(5101);
  });
  it('restores public cameras without stream credentials or tenant content',()=>{
    const cameras=live('cameras',{cameras:[{id:'a',name:'Test public camera',lat:25,lng:55,feed_url:'https://example.invalid/live?key=NEVER',password:'SECRET'},{id:'b',name:'PRIVATE',lat:25,lng:56,organization_id:'TENANT'}]});
    const atlas=atlasPresentationData({cameras},new Set());
    expect(atlas.activeLayers.cctv).toBe(true);
    expect(atlas.data.cameras).toHaveLength(1);
    expect(JSON.stringify(cameras)).not.toMatch(/NEVER|SECRET|PRIVATE|TENANT/);
  });
  it('keeps openly published camera image and stream links for the player',()=>{
    const cameras=live('cameras',{cameras:[
      {id:'img',name:'Snapshot camera',lat:51.5,lng:-0.1,feed_url:'https://images.example.org/cam/1.jpg',source:'Test DOT'},
      {id:'hls',name:'Stream camera',lat:42.5,lng:27.4,stream_url:'https://video.example.org/cam.m3u8',stream_type:'hls',source:'Test city'},
      {id:'yt',name:'YouTube camera',lat:32,lng:34.8,stream_url:'https://www.youtube.com/embed/abc?autoplay=1&mute=1',stream_type:'iframe',source:'YouTube Live'},
      {id:'bad',name:'Keyed camera',lat:40,lng:-74,stream_url:'https://video.example.org/cam.m3u8?token=NEVER',stream_type:'hls',feed_url:'https://user:pw@example.org/x.jpg'},
    ]});
    const [img,hls,yt,bad]=cameras.features.map(feature=>feature.properties!);
    expect(img).toMatchObject({feed_url:'https://images.example.org/cam/1.jpg'});
    expect(hls).toMatchObject({stream_url:'https://video.example.org/cam.m3u8',stream_type:'hls'});
    expect(yt.sourceUrl).toBe('https://www.youtube.com/embed/abc?autoplay=1&mute=1');
    expect(bad.stream_url).toBeUndefined();
    expect(bad.feed_url).toBeUndefined();
    expect(bad.stream_type).toBeUndefined();
  });
  it('restores broadcaster and approximate news markers without asserting verified live video',()=>{
    const broadcasts=live('broadcasts',{feeds:[{name:'Test newsroom',city:'Test city',lat:25,lng:55,url:'https://example.invalid/news'}]});
    const news=live('news',{news:[{id:'a',title:'Test story',coords:[25,55],coords_default:true,link:'https://example.invalid/story'}]});
    const atlas=atlasPresentationData({broadcasts,news},new Set());
    expect(atlas.activeLayers.live_news).toBe(true);
    expect(atlas.data.live_feeds[0].url).toContain('/news');
    expect(broadcasts.reference).toBe(true);
    expect(news.features[0].properties?.approximate_location).toBe(true);
  });
  it('restores conflict icons but excludes synthesized RSS scatter coordinates',()=>{
    const conflicts=live('conflicts',{zones:[{label:'TEST REGION',lat:25,lng:55,severity:'war',lastUpdated:new Date().toISOString()}],liveEvents:[{title:'Artificial scatter',lat:25.1,lng:55.1}]});
    const atlas=atlasPresentationData({conflicts},new Set());
    expect(atlas.activeLayers.conflict_zones).toBe(true);
    expect(atlas.data.conflict_markers).toHaveLength(1);
    expect(conflicts.features[0].properties?.observedAt).toBeNull();
    expect(JSON.stringify(conflicts)).not.toContain('Artificial scatter');
  });
  it('restores infrastructure and sanctions port associations, not invented vessel positions',()=>{
    const infrastructure=live('infrastructure',{infrastructure:[{name:'Test facility',lat:25,lng:55}]});
    const sanctions=live('war-sanctions',{points:[{name:'Test vessel / Test port',vessel:'Test vessel',port:'Test port',lat:25,lng:55,classification:'Shadow Fleet',sourceUrl:'https://example.invalid/sanctions'}]});
    const atlas=atlasPresentationData({infrastructure,'war-sanctions':sanctions},new Set());
    expect(atlas.data.infrastructure).toHaveLength(1);
    expect(atlas.data.public_sanctions[0]).toMatchObject({reference:true,port:'Test port'});
    expect(atlas.data.maritime_ships).toEqual([]);
  });
});
describe('progressive camera directory cache',()=>{
  beforeEach(()=>regionCache.clear());
  it('returns completed regions without waiting for a missing region; deduplicates camera IDs',()=>{
    const camera={id:'test',lat:25,lng:55,name:'Test camera',city:'Test',country:'XX',source:'Test fixture'};
    regionCache.set('one',{cams:[camera],at:10000});
    regionCache.set('two',{cams:[camera],at:10000});
    expect(publicCameraSnapshot(10001).cameras).toHaveLength(1);
    expect(publicCameraSnapshot(10000+16*60000).cameras).toEqual([]);
  });
});
