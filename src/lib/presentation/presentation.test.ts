import { describe,it,expect,vi,beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_PRESENTATION } from './types';
import { presentationDestination,resolvePresentationView,safeReturnPath,protectedPresentationApi } from './policy';
import { normalizePublicFeed,publicUrl,publicTime,feedIds } from './feeds';
vi.mock('@/lib/auth/actor',()=>({requireAuthenticatedActor:vi.fn()}));
import { presentationBody,sameOrigin,presentationFailure,PresentationError,presentationAdmin } from './http';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';

const on={...DEFAULT_PRESENTATION,enabled:true};
describe('presentation routing is opt-in',()=>{
  it.each(['/','/atlas','/imports','/logistics','/operations','/cases','/login','/admin','/verify'])('OFF leaves %s unchanged',path=>{
    expect(presentationDestination(path,DEFAULT_PRESENTATION,'map')).toBeNull();
  });
  it.each(['/','/atlas','/imports','/logistics/map','/operations','/cases','/onboarding','/verify'])('ON map redirects %s',path=>{
    expect(presentationDestination(path,on,'map')).toBe('/presentation');
  });
  it.each(['/imports','/operations','/logistics','/login','/verify'])('ON full preserves %s',path=>expect(presentationDestination(path,on,'full')).toBeNull());
  it('keeps owner pages, APIs and owner login reachable',()=>{
    for(const path of ['/admin','/admin/presentation','/api/logistics'])expect(presentationDestination(path,on,'map')).toBeNull();
    expect(presentationDestination('/login',on,'map',true)).toBeNull();
  });
  it('keeps only the two public setup guides reachable during PIN-locked Map view',()=>{
    const locked={...on,pinRequired:true};
    for(const path of ['/docs/research-setup','/docs/sdk-setup'])expect(presentationDestination(path,locked,'map')).toBeNull();
    for(const path of ['/docs/private','/docs/research-setup/private','/knowledge'])expect(presentationDestination(path,locked,'map')).toBe('/presentation');
    expect(resolvePresentationView(locked,'full','full',false)).toBe('map');
    expect(protectedPresentationApi('/api/ai/research','POST')).toBe(true);
  });
  it('honours cookies and URL choice without bypassing a PIN',()=>{
    expect(resolvePresentationView(on,'map','full',true)).toBe('map');
    expect(resolvePresentationView(on,'full','map',true)).toBe('full');
    expect(resolvePresentationView(on,null,'full',true)).toBe('full');
    expect(resolvePresentationView({...on,pinRequired:true},'full','full',false)).toBe('map');
    expect(resolvePresentationView({...on,pinRequired:true},'full','full.grant',true)).toBe('full');
  });
  it.each(['https://evil.invalid','//evil.invalid','/\\evil.invalid','/api/ai','/presentation','/\nLocation: evil'])('rejects unsafe return path %s',value=>expect(safeReturnPath(value)).toBe('/operations'));
  it('allows an internal return path only',()=>expect(safeReturnPath('/imports?batch=1')).toBe('/imports?batch=1&view=full'));
  it.each(['/api/ai/settings','/api/platform/configuration','/api/logistics/shipments','/api/imports','/api/intelligence/events','/api/sdk/stream'])('auth guards private %s in every mode',path=>expect(protectedPresentationApi(path,'GET')).toBe(true));
  it.each(['/api/flights','/api/news','/api/presentation/settings','/api/webhooks/resend','/api/logistics/disruptions/sync'])('does not reroute public/service %s',path=>expect(protectedPresentationApi(path,'GET')).toBe(false));
  it('requires login on the original AIS endpoint if a customer/contract feed is configured',()=>{
    expect(protectedPresentationApi('/api/maritime','GET',true)).toBe(true);
    expect(protectedPresentationApi('/api/maritime','GET',false)).toBe(false);
  });
});
describe('public normalization never projects organization data',()=>{
  it('selects only public host fields and does not promote fetch time to observation',()=>{
    const feed=normalizePublicFeed('flights',{commercial_flights:[{lat:24,lng:54,callsign:'TEST',icao24:'abc',timestamp:Date.now(),apiKey:'NEVER',passengers:['PRIVATE']}],organization_id:'PRIVATE'});
    expect(JSON.stringify(feed)).not.toMatch(/NEVER|PRIVATE/);
    expect(feed.features[0].properties?.observedAt).toBeNull();
  });
  it.each(['https://example.invalid/?key=secret','https://user:password@example.invalid','javascript:alert(1)'])('strips unsafe link %s',url=>expect(publicUrl(url)).toBe(''));
  it('keeps safe citations and valid timestamps',()=>{
    expect(publicUrl('https://example.invalid/article')).toContain('/article');
    expect(publicTime('not-a-date')).toBeNull();expect(publicTime(0)).toBeNull();
    expect(publicTime('2026-10-16T00:00:00Z')).toBe('2026-10-16T00:00:00.000Z');
  });
  it.each([
    ['2026-10-15','2333','2026-10-15T23:33:00.000Z'],
    ['2026-10-16','43','2026-10-16T00:43:00.000Z'],
    ['2026-10-16','','2026-10-16T00:00:00.000Z'],
    ['2026-10-16','2460',null],
    ['', '2333',null],
  ])('combines FIRMS date %s and UTC acquisition time %s without inventing a year', (date,time,expected)=>{
    const feed=normalizePublicFeed('fires',{fires:[{lat:24,lng:54,date,time}]});
    expect(feed.features[0].properties?.observedAt).toBe(expected);
    expect(feed.observedAt).toBe(expected);
  });
  it('rejects unusable positions instead of claiming global zero activity',()=>{
    expect(()=>normalizePublicFeed('flights',{commercial_flights:[{lat:999,lng:24}]})).toThrow();
    expect(()=>normalizePublicFeed('maritime',{ships:[]})).toThrow();
    expect(()=>normalizePublicFeed('space-weather',{kp_index:0})).toThrow();
  });
  it('keeps legitimately empty event feeds distinct from a failed source',()=>{
    expect(normalizePublicFeed('earthquakes',{earthquakes:[]}).features).toEqual([]);
    expect(()=>normalizePublicFeed('earthquakes',{error:'upstream secret'})).toThrow('Public source unavailable');
  });
  it('includes all supported feed types and marks infrastructure reference',()=>{
    expect(feedIds).toHaveLength(18);
    expect(normalizePublicFeed('cables',{features:[]}).reference).toBe(true);
  });
  it('does not publish customer/contract AIS or tenant-owned positions',()=>{
    const feed=normalizePublicFeed('maritime',{ships:[{lat:24,lng:54,source:'digitraffic',mmsi:'PUBLIC'},{lat:25,lng:55,source:'customer-ais',mmsi:'PRIVATE'},{lat:26,lng:56,source:'marinetraffic',mmsi:'CONTRACT'},{lat:27,lng:57,source:'digitraffic',organization_id:'private-org',mmsi:'TENANT'}]});
    expect(feed.features).toHaveLength(1);expect(JSON.stringify(feed)).not.toMatch(/PRIVATE|CONTRACT|TENANT|private-org/);
  });
  it('projects news without raw article text, secrets or private fields',()=>{
    const feed=normalizePublicFeed('news',{news:[{id:'x',title:'Event',link:'https://example.invalid/a',full_text:'PRIVATE',secret:'NEVER',published:'2026-10-16T00:00Z'}],news_sources:[]});
    expect(JSON.stringify(feed)).not.toMatch(/PRIVATE|NEVER/);expect(feed.news[0].title).toBe('Event');
  });
});
describe('admin input boundaries',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('delegates to the existing owner permission, not a new role',async()=>{
    await presentationAdmin(new NextRequest('http://localhost/admin'));
    expect(requireAuthenticatedActor).toHaveBeenCalledWith(expect.anything(),'organization:manage');
  });
  it('rejects foreign-origin changes',async()=>{
    const request=new NextRequest('http://localhost/api/presentation/settings',{method:'PATCH',headers:{origin:'https://evil.invalid'}});
    expect(sameOrigin(request)).toBe(false);
    await expect(presentationAdmin(request)).rejects.toMatchObject({status:403});
    expect(requireAuthenticatedActor).not.toHaveBeenCalled();
  });
  it('enforces actual streamed body size',async()=>{
    await expect(presentationBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:'x'.repeat(5000)})}))).rejects.toMatchObject({status:413});
  });
  it.each(['[]','null','broken'])('rejects malformed body %s',async body=>await expect(presentationBody(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body}))).rejects.toThrow());
  it('returns actionable errors, never raw exceptions or keys',async()=>{
    expect(presentationFailure(new OrganizationAccessError('Authentication is required.')).status).toBe(401);
    expect(presentationFailure(new OrganizationAccessError()).status).toBe(403);
    expect(presentationFailure(new PresentationError('Conflict',409)).status).toBe(409);
    expect(JSON.stringify(await presentationFailure(new Error('KEY=secret')).json())).not.toContain('secret');
  });
});
