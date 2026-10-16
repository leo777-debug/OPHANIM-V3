import { NextRequest } from 'next/server';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
vi.mock('@/lib/auth/actor',()=>({requireAuthenticatedActor:vi.fn()}));
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { GET as stream } from './stream/route';
import { GET as status, POST as ingest } from './ingest/route';

const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const actor={userId:'synthetic-sdk-user',organizationId:a,role:'owner' as const,email:'synthetic@example.test',displayName:null,authProvider:'legacy' as const};
const request=()=>new NextRequest('http://localhost/api/sdk/stream');
beforeEach(()=>{
  vi.useFakeTimers();vi.clearAllMocks();
  vi.mocked(requireAuthenticatedActor).mockResolvedValue(actor);
  vi.stubEnv('SDK_INGEST_KEY','synthetic-sdk-test-only');vi.stubEnv('SDK_INGEST_ORGANIZATION_ID',a);
  Object.assign(globalThis,{sdkEntityStore:new Map([['own',{id:'own',organizationId:a,name:'SYNTHETIC-A'}],['foreign',{id:'foreign',organizationId:b,name:'SYNTHETIC-B-PRIVATE'}]]),sdkLastUpdate:Date.now(),sdkIngestLog:[]});
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();});
describe('SDK tenant and stream lifetime boundary',()=>{
  it('rejects anonymous status and stream requests',async()=>{
    vi.mocked(requireAuthenticatedActor).mockRejectedValue(new OrganizationAccessError('Authentication is required.'));
    const response=await stream(request());
    if(response.status===200)await response.body?.cancel();
    expect([401,403]).toContain(response.status);
    expect([401,403]).toContain((await status(request())).status);
  });
  it('streams only the authenticated organization, never the other organization',async()=>{
    const response=await stream(request());const reader=response.body!.getReader();
    const first=new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(first.slice(6)).payload.entityCount).toBe(1);
    await vi.advanceTimersByTimeAsync(5001);
    const update=new TextDecoder().decode((await reader.read()).value);
    expect(update).toContain('SYNTHETIC-A');expect(update).not.toContain('SYNTHETIC-B-PRIVATE');
    await reader.cancel();
  });
  it('releases all stream intervals immediately when the browser disconnects',async()=>{
    const response=await stream(request());await response.body!.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('accepts zero coordinates and ignores any organization supplied by the sender',async()=>{
    const response=await ingest(new NextRequest('http://localhost/api/sdk/ingest',{method:'POST',body:JSON.stringify({apiKey:'synthetic-sdk-test-only',source:'synthetic',organizationId:b,entities:[{id:'zero',position:{lat:0,lng:0}}]})}));
    expect(response.status).toBe(200);expect((await response.json()).accepted).toBe(1);
    const data=await status(request());expect((await data.json()).entityCount).toBe(2);
  });
});
