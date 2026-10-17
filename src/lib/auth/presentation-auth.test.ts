import { describe,it,expect,vi,beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({query:vi.fn(),client:vi.fn(),demo:vi.fn()}));
vi.mock('@/lib/watchlists/db',()=>({db:()=>({query:mocks.query})}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:mocks.client}));
vi.mock('./demo-access',()=>({presentationDemoActor:mocks.demo}));
import { getAuthenticatedActor } from './actor';
const request=()=>new NextRequest('http://localhost/api/presentation/admin',{headers:{Cookie:'ophanim_session=test-legacy-token'}});
describe('presentation proxy preserves the existing authentication boundary',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.demo.mockResolvedValue(null);});
  it('cannot use a legacy cookie to bypass a configured Supabase session',async()=>{
    mocks.client.mockResolvedValue({auth:{getClaims:async()=>({data:null,error:new Error('Expired')})}});
    expect(await getAuthenticatedActor(request())).toBeNull();expect(mocks.query).not.toHaveBeenCalled();
  });
  it('still accepts existing legacy sessions when Supabase is not configured',async()=>{
    mocks.client.mockResolvedValue(null);
    mocks.query.mockResolvedValue({rows:[{user_id:'u',organization_id:'o',role:'owner',email:'test@presentation.invalid',display_name:'Test owner'}]});
    expect((await getAuthenticatedActor(request()))?.role).toBe('owner');expect(mocks.query).toHaveBeenCalled();
  });
  it('uses a request-bound client in proxy without reading Next page cookies',async()=>{
    const client={auth:{getClaims:async()=>({data:null,error:null})}} as unknown as NonNullable<Parameters<typeof getAuthenticatedActor>[1]>;
    expect(await getAuthenticatedActor(request(),client)).toBeNull();expect(mocks.client).not.toHaveBeenCalled();
  });
  it('uses explicit temporary demo access for a visitor without a session',async()=>{
    mocks.client.mockResolvedValue(null);
    mocks.demo.mockResolvedValue({userId:'demo-u',organizationId:'demo-o',role:'owner',authProvider:'presentation-demo'});
    expect((await getAuthenticatedActor(new NextRequest('http://localhost/api/auth/me')))?.authProvider).toBe('presentation-demo');
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('never replaces a real authenticated actor with demo access',async()=>{
    mocks.client.mockResolvedValue(null);
    mocks.query.mockResolvedValue({rows:[{user_id:'u',organization_id:'o',role:'owner',email:'test@presentation.invalid',display_name:'Test owner'}]});
    expect((await getAuthenticatedActor(request()))?.authProvider).toBe('legacy');
    expect(mocks.demo).not.toHaveBeenCalled();
  });
});
