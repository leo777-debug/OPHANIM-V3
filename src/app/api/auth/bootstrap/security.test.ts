import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),release:vi.fn(),connect:vi.fn(),deleteUser:vi.fn(),signIn:vi.fn()}));
vi.mock('@/lib/watchlists/db',()=>({db:()=>({connect:mocks.connect})}));
vi.mock('@/lib/ssrf-guard',()=>({getClientIp:()=> '127.0.0.1',isRateLimited:()=>false}));
vi.mock('@/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>({auth:{admin:{createUser:async()=>({data:{user:{id:'00000000-0000-4000-8000-000000000001'}},error:null}),deleteUser:mocks.deleteUser}}})}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({auth:{signInWithPassword:mocks.signIn}})}));
vi.mock('@/lib/auth/session',()=>({createSession:vi.fn(),setOrganizationCookie:(response:Response)=>response,setSessionCookie:(response:Response)=>response}));
import { POST } from './route';
const body={token:'synthetic-bootstrap-only',email:'owner@example.test',password:'Synthetic-password-Only-493!',organizationName:'Demo only',organizationSlug:'demo-only'};
function request(value:unknown=body,origin?:string){return new NextRequest('http://localhost/api/auth/bootstrap',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(value)});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('OPHANIM_BOOTSTRAP_TOKEN',body.token);mocks.deleteUser.mockResolvedValue({error:null});mocks.connect.mockResolvedValue({query:mocks.query,release:mocks.release});mocks.query.mockImplementation(async(sql:string)=>({rows:sql.includes('count(*)')?[{count:'0'}]:[{id:'00000000-0000-4000-8000-000000000002'}]}));mocks.signIn.mockResolvedValue({error:null});});
afterEach(()=>vi.unstubAllEnvs());
it('rejects cross-site setup before storage',async()=>{expect((await POST(request(body,'https://untrusted.example.test'))).status).toBe(403);expect(mocks.connect).not.toHaveBeenCalled();});
it('rejects null JSON without throwing',async()=>{expect((await POST(request(null))).status).toBe(400);expect(mocks.connect).not.toHaveBeenCalled();});
it('bounds the actual setup request before parsing',async()=>{expect((await POST(request({...body,displayName:'x'.repeat(40000)}))).status).toBe(413);expect(mocks.connect).not.toHaveBeenCalled();});
it('does not delete a committed owner when automatic sign-in throws',async()=>{mocks.signIn.mockRejectedValueOnce(new Error('synthetic-private-auth-error'));const response=await POST(request());expect(response.status).toBe(503);expect(mocks.query.mock.calls.some(([sql])=>sql==='commit')).toBe(true);expect(mocks.deleteUser).not.toHaveBeenCalled();expect(await response.text()).not.toContain('synthetic-private');});
it('returns a safe service error on a database connection failure',async()=>{mocks.connect.mockRejectedValueOnce(new Error('synthetic-private-database'));const response=await POST(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain('synthetic-private');});
