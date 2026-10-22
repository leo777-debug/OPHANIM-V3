import { afterEach,describe,expect,it,vi } from 'vitest';
import { parseWindy,windyCameras } from './windy';
const port={code:'AEJEA',name:'Jebel Ali',country:'AE',lat:25,lon:55.06};
const camera={webcamId:123,title:'Public coast',status:'active',lastUpdatedOn:'2026-10-21T10:00:00Z',location:{latitude:25.01,longitude:55.07},player:{day:'https://webcams.windy.com/webcams/public/embed/player/123/day'},urls:{detail:'https://www.windy.com/webcams/123'}};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('optional public Windy adapter',()=>{
 it('retains provider URLs, attribution and uncertainty instead of claiming active is live',()=>{
  const [feed]=parseWindy({webcams:[camera]},port);
  expect(feed.status).toBe('unverified');expect(feed.streamUrl).toBe(camera.player.day);
  expect(feed.attribution).toContain('Windy.com');expect(feed.healthCheckAllowed).toBe(false);expect(feed.coverage).toContain('time lapse');
 });
 it('rejects untrusted embeds, missing coordinates and cameras outside the selected port area',()=>{
  expect(parseWindy({webcams:[{...camera,player:{live:'https://evil.example/'}},{...camera,location:null},{...camera,location:{latitude:40,longitude:55}}]},port)).toEqual([]);
  expect(parseWindy({webcams:[{...camera,urls:{detail:'https://x:y@windy.com/webcams/123'}}]},port)).toEqual([]);
 });
 it('makes no call with blank keys or an unreviewed contract',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);vi.stubEnv('WINDY_WEBCAMS_API_KEY','');
  expect((await windyCameras(port)).cameras).toEqual([]);expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv('WINDY_WEBCAMS_API_KEY','test-only');vi.stubEnv('WINDY_WEBCAMS_TERMS_REVIEWED','');
  expect((await windyCameras(port)).warnings.length).toBeGreaterThan(0);expect(fetcher).not.toHaveBeenCalled();
 });
 it('uses the API with server-side credentials and caches short-lived player URLs',async()=>{
  vi.stubEnv('WINDY_WEBCAMS_API_KEY','test-only');vi.stubEnv('WINDY_WEBCAMS_TERMS_REVIEWED','true');
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({webcams:[camera]})));vi.stubGlobal('fetch',fetcher);
  const one=await windyCameras(port),two=await windyCameras(port);expect(one.cameras.length).toBe(1);expect(two).toEqual(one);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0].origin).toBe('https://api.windy.com');expect(fetcher.mock.calls[0][1].redirect).toBe('error');expect(JSON.stringify(one)).not.toContain('test-only');
 });
});
