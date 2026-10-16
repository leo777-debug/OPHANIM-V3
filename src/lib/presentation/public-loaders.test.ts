import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({marine:vi.fn(),cameraRoute:vi.fn(),cameraSnapshot:vi.fn(),broadcast:vi.fn(),conflict:vi.fn(),infrastructure:vi.fn(),sanctions:vi.fn()}));
vi.mock('@/app/api/maritime/route',()=>({GET:mocks.marine}));
vi.mock('@/app/api/cctv/route',()=>({GET:mocks.cameraRoute}));
vi.mock('@/app/api/cctv/region-cache',()=>({publicCameraSnapshot:mocks.cameraSnapshot}));
vi.mock('@/app/api/live-news/route',()=>({GET:mocks.broadcast}));
vi.mock('@/app/api/conflicts/route',()=>({GET:mocks.conflict}));
vi.mock('@/app/api/infrastructure/route',()=>({GET:mocks.infrastructure}));
vi.mock('@/lib/providers/providers/war-sanctions-provider',()=>({warSanctionsProvider:{createMapLayers:mocks.sanctions}}));

describe('existing public loader connections (no live HTTP)',()=>{
  beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
  it('shares one bounded maritime request across ships, ports and chokepoints',async()=>{
    mocks.marine.mockResolvedValue(Response.json({ships:[],ports:[{name:'Test port'}],chokepoints:[]}));
    const {loadPublicPayload}=await import('./public-loaders');
    const results=await Promise.all(['maritime','ports','chokepoints'].map(id=>loadPublicPayload(id as 'ports')));
    expect(mocks.marine).toHaveBeenCalledTimes(1);
    expect(results[1]).toMatchObject({ports:[{name:'Test port'}]});
  });
  it('reads completed camera regions without waiting for the global GET aggregation',async()=>{
    mocks.cameraSnapshot.mockReturnValue({cameras:[{name:'Test public camera'}]});
    const {loadPublicPayload}=await import('./public-loaders');
    expect(await loadPublicPayload('cameras')).toEqual({cameras:[{name:'Test public camera'}]});
    expect(mocks.cameraRoute).not.toHaveBeenCalled();
  });
  it('connects original broadcaster, conflict and infrastructure adapters',async()=>{
    mocks.broadcast.mockResolvedValue(Response.json({feeds:[{name:'Test newsroom'}]}));
    mocks.conflict.mockResolvedValue(Response.json({zones:[{label:'Test region'}]}));
    mocks.infrastructure.mockResolvedValue(Response.json({infrastructure:[{name:'Test facility'}]}));
    const {loadPublicPayload}=await import('./public-loaders');
    expect(await loadPublicPayload('broadcasts')).toMatchObject({feeds:[{}]});
    expect(await loadPublicPayload('conflicts')).toMatchObject({zones:[{}]});
    expect(await loadPublicPayload('infrastructure')).toMatchObject({infrastructure:[{}]});
  });
  it('uses only the named existing sanctions provider, never tenant provider selection',async()=>{
    mocks.sanctions.mockResolvedValue([{source:{features:[{geometry:{type:'Point',coordinates:[55,25]},properties:{vessel:'Test vessel',port:'Test port',sourceUrl:'https://example.invalid/record'}}]}}]);
    const {loadPublicPayload}=await import('./public-loaders');
    expect(await loadPublicPayload('war-sanctions')).toMatchObject({points:[{lat:25,lng:55,vessel:'Test vessel'}]});
    expect(mocks.sanctions).toHaveBeenCalledWith(expect.objectContaining({requestedProviders:['war-sanctions']}));
  });
});
