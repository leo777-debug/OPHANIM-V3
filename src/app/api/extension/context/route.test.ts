import { NextRequest } from 'next/server';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({actor:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/auth/actor',()=>({getAuthenticatedActor:mocks.actor,requireAuthenticatedActor:async(request:Request)=>{
  if(!trustedRequestOrigin(request))throw new OrganizationAccessError('Cross-origin mutations are not permitted.');
  const actor=await mocks.actor();if(!actor)throw new OrganizationAccessError('Authentication is required.');return actor;
}}));
vi.mock('@/lib/extension/context',()=>({loadExtensionContext:mocks.load}));
vi.mock('@/lib/extension/validation',()=>({ExtensionContextValidationError:class extends Error{},validateExtensionContextInput:(value:unknown)=>value}));
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { trustedRequestOrigin } from '@/lib/http/request-origin';
import { OPTIONS,POST } from './route';
const id='a'.repeat(32),origin=`chrome-extension://${id}`;
function request(source=origin,value:unknown={url:'https://example.test'}){return new NextRequest('http://localhost/api/extension/context',{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(value)});}
beforeEach(()=>{mocks.actor.mockReset();mocks.load.mockReset();vi.stubEnv('OPHANIM_EXTENSION_IDS',id);vi.stubEnv('NODE_ENV','production');mocks.actor.mockResolvedValue({organizationId:'org-a',userId:'synthetic-user',role:'viewer'});mocks.load.mockResolvedValue({matches:[]});});
afterEach(()=>vi.unstubAllEnvs());
it('allows only a configured extension to read with an authenticated membership',async()=>{const response=await POST(request());expect(response.status).toBe(200);expect(response.headers.get('access-control-allow-origin')).toBe(origin);expect(mocks.load.mock.calls[0][0].organizationId).toBe('org-a');});
it.each([`chrome-extension://${'b'.repeat(32)}`,'https://untrusted.example.test',`${origin}/spoof`])('rejects unlisted or malformed browser origins before reading private data: %s',async source=>{expect((await POST(request(source))).status).toBe(403);expect(mocks.actor).not.toHaveBeenCalled();expect(mocks.load).not.toHaveBeenCalled();});
it('still requires login for a permitted extension',async()=>{mocks.actor.mockResolvedValueOnce(null);expect((await POST(request())).status).toBe(401);expect(mocks.load).not.toHaveBeenCalled();});
it('rejects an oversized extension body before context access',async()=>{expect((await POST(request(origin,{url:'x'.repeat(40000)}))).status).toBe(413);expect(mocks.load).not.toHaveBeenCalled();});
it('retains a same-origin UI positive control without extension CORS',async()=>{const response=await POST(request('http://localhost'));expect(response.status).toBe(200);expect(response.headers.has('access-control-allow-origin')).toBe(false);});
it('only acknowledges the configured preflight',()=>{expect(OPTIONS(request()).status).toBe(204);expect(OPTIONS(request(`chrome-extension://${'b'.repeat(32)}`)).status).toBe(403);});
