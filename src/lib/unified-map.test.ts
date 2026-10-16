import { describe, expect, it, vi } from 'vitest';
import { defaultUnifiedMapState, legacyAtlasDestination, patchUnifiedWorkspace, restoreUnifiedMapState } from './unified-map';
import { createMapWorkspace } from './map-workspaces';
import { feedIds } from './presentation/feeds';

describe('one operational map state',()=>{
  it('enables the real public feed set on a dark 3D globe by default',()=>{
    const state=defaultUnifiedMapState();
    expect(state.workspaces[0].projection).toBe('globe');
    expect(state.workspaces[0].mapStyle).toBe('dark');
    expect(Object.keys(state.workspaces[0].activeLayers)).toEqual(feedIds);
  });
  it('keeps per-globe style, viewport and layers independent and restores across surfaces',()=>{
    let state=defaultUnifiedMapState();
    state.workspaces.push(createMapWorkspace({...state.workspaces[0],id:'second',label:'Gulf'}));
    state.activeId='second';
    state=patchUnifiedWorkspace(state,{mapStyle:'earth',projection:'mercator',viewport:{latitude:25,longitude:55,zoom:5},activeLayers:{maritime:true,flights:false}});
    const restored=restoreUnifiedMapState(JSON.stringify(state));
    expect(restored.activeId).toBe('second');
    expect(restored.workspaces[0].mapStyle).toBe('dark');
    expect(restored.workspaces[1]).toMatchObject({mapStyle:'earth',projection:'mercator',viewport:{latitude:25,longitude:55,zoom:5},activeLayers:{maritime:true,flights:false}});
  });
  it.each(['broken','null','{}','{"version":1,"workspaces":[]}'])('recovers from invalid browser state: %s',raw=>expect(restoreUnifiedMapState(raw)).toEqual(defaultUnifiedMapState()));
  it('drops unknown persisted fields and rejects invalid coordinates and duplicate tabs',()=>{
    const state=defaultUnifiedMapState();
    Object.assign(state.workspaces[0],{apiKey:'MUST-NOT-PERSIST',privateRecords:[1]});
    expect(JSON.stringify(restoreUnifiedMapState(JSON.stringify(state)))).not.toContain('MUST-NOT-PERSIST');
    state.workspaces[0].viewport.latitude=999;
    expect(restoreUnifiedMapState(JSON.stringify(state))).toEqual(defaultUnifiedMapState());
    state.workspaces=[defaultUnifiedMapState().workspaces[0],defaultUnifiedMapState().workspaces[0]];
    expect(restoreUnifiedMapState(JSON.stringify(state))).toEqual(defaultUnifiedMapState());
  });
  it('redirects legacy Atlas links to the canonical map, retaining only map parameters',()=>{
    const href=legacyAtlasDestination({view:'full',tool:'shodan',layers:'flights,cables',lat:'25',lon:'55',zoom:'4',key:'NEVER',shipment:'PRIVATE'});
    expect(href).toBe('/logistics/map?view=full&tool=shodan&layers=flights%2Ccables&lat=25&lon=55&zoom=4');
    expect(legacyAtlasDestination({tool:'https://evil.invalid',view:'bad',layers:['a','b']})).toBe('/logistics/map');
  });
});

vi.mock('@/lib/presentation/settings',()=>({presentationSettingsOrOff:vi.fn()}));
vi.mock('@/lib/presentation/snapshots',()=>({presentationFeed:vi.fn()}));
import { presentationSettingsOrOff } from './presentation/settings';
import { presentationFeed } from './presentation/snapshots';
import { DEFAULT_PRESENTATION } from './presentation/types';
import { GET } from '@/app/api/map/feeds/[id]/route';
import { NextRequest } from 'next/server';

describe('shared public map feed route',()=>{
  it('uses the same public feed projector in both modes, never a tenant feed',async()=>{
    const request=new NextRequest('http://localhost/api/map/feeds/news');
    for(const enabled of [false,true]){
      vi.mocked(presentationSettingsOrOff).mockResolvedValue({...DEFAULT_PRESENTATION,enabled,replay:'on'});
      vi.mocked(presentationFeed).mockResolvedValue({id:'news'} as Awaited<ReturnType<typeof presentationFeed>>);
      const response=await GET(request,{params:Promise.resolve({id:'news'})});
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(presentationFeed).toHaveBeenLastCalledWith('news',enabled?'on':'off');
    }
  });
  it('rejects arbitrary provider names and contains failures',async()=>{
    const request=new NextRequest('http://localhost/api/map/feeds/private');
    expect((await GET(request,{params:Promise.resolve({id:'private'})})).status).toBe(404);
    vi.mocked(presentationSettingsOrOff).mockResolvedValue(DEFAULT_PRESENTATION);
    vi.mocked(presentationFeed).mockRejectedValue(new Error('secret upstream details'));
    const response=await GET(request,{params:Promise.resolve({id:'news'})});
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
  });
});
