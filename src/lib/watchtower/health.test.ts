import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { checkCameraHealth } from './health';
import { effectiveCamera,type CameraFeed } from './catalogue';
const mocks=vi.hoisted(()=>({query:vi.fn(),catalogue:[] as unknown[]}));
vi.mock('@/lib/watchlists/db',()=>({db:()=>({query:mocks.query})}));
vi.mock('./catalogue',async original=>({...await original<typeof import('./catalogue')>(),cameraCatalogue:mocks.catalogue}));
const feed={id:'test-only',sourceUrl:'https://public.example/camera',publicViewingVerified:true,healthCheckAllowed:true,status:'online',lastSeen:new Date().toISOString()} as CameraFeed;
beforeEach(()=>{mocks.catalogue.splice(0,mocks.catalogue.length,feed);mocks.query.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
describe('camera health retry and freshness',()=>{
 it('marks offline only after three consecutive failed checks',async()=>{
  mocks.query.mockResolvedValueOnce({rows:[{consecutive_failures:2,checked_at:'2020-01-01'}]}).mockResolvedValue({rows:[]});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})));
  await checkCameraHealth();expect(mocks.query.mock.calls[1][1]).toEqual(['test-only','offline',expect.any(String),3]);
 });
 it('keeps an initial failure unknown and resets failures on recovery without inventing live playback',async()=>{
  mocks.query.mockResolvedValueOnce({rows:[]}).mockResolvedValue({rows:[]});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})));
  await checkCameraHealth();expect(mocks.query.mock.calls[1][1][1]).toBe('unverified');
  mocks.query.mockReset().mockResolvedValueOnce({rows:[{consecutive_failures:3,checked_at:'2020-01-01'}]}).mockResolvedValue({rows:[]});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:200})));
  await checkCameraHealth();expect(mocks.query.mock.calls[1][1]).toEqual(['test-only','unverified',expect.any(String),0]);
  expect(effectiveCamera(feed,{status:'unverified',last_seen:feed.lastSeen}).status).toBe('unverified');
 });
 it('skips recent checks and feeds without explicit polling permission',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);mocks.query.mockResolvedValue({rows:[{checked_at:new Date(),consecutive_failures:0}]});
  expect((await checkCameraHealth()).checked).toBe(0);expect(fetcher).not.toHaveBeenCalled();
  mocks.catalogue.splice(0,1,{...feed,healthCheckAllowed:false});mocks.query.mockClear();await checkCameraHealth();expect(mocks.query).not.toHaveBeenCalled();
 });
});
