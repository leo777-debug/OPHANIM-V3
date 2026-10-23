import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { OrganizationAccessError } from '@/lib/operations/authorization';
const mocks=vi.hoisted(()=>({actor:vi.fn(),request:vi.fn(),resolve:vi.fn()}));
vi.mock('@/lib/auth/actor',()=>({requireAuthenticatedActor:mocks.actor}));
vi.mock('@/lib/integrations/probes',()=>({requestIntegration:mocks.request}));
vi.mock('@/lib/ssrf-guard',()=>({isRateLimited:()=>false}));
vi.mock('../../../../../intel/resolvers.mjs',()=>({RESOLVERS:{aircraft:mocks.resolve,vessel:mocks.resolve,company:mocks.resolve,country:mocks.resolve},sanitizeId:(value:string)=>value}));
import {GET} from './route';
const organizationId='11111111-1111-4111-8111-111111111111';
const request=(type='company')=>new NextRequest(`http://ophanim.example/api/entity/expand?type=${type}&id=Test%20Company`);
beforeEach(()=>{
 vi.resetAllMocks();
 for(const [key,value] of Object.entries({INTEL_URL:'http://worker:4000',INTEL_API_TOKEN:'synthetic-dedicated-entity-token-long-enough',INTEL_ORGANIZATION_ID:organizationId}))vi.stubEnv(key,value);
 mocks.actor.mockResolvedValue({organizationId,userId:'fixture',authProvider:'legacy'});
 mocks.request.mockResolvedValue(JSON.stringify({nodes:[],links:[]}));
 mocks.resolve.mockResolvedValue({nodes:[{id:'company:child',label:'Child',type:'company',properties:{source:'Wikidata'}}],links:[{source:'company:Test Company',target:'company:child',label:'PARENT ORG'}]});
});
afterEach(()=>vi.unstubAllEnvs());
it('requires a real matching-tenant session and intelligence permission',async()=>{
 mocks.actor.mockRejectedValueOnce(new OrganizationAccessError('Authentication is required.'));expect((await GET(request())).status).toBe(401);
 mocks.actor.mockRejectedValueOnce(new OrganizationAccessError());expect((await GET(request())).status).toBe(403);
 mocks.actor.mockResolvedValueOnce({organizationId:'foreign',userId:'foreign'});expect((await GET(request())).status).toBe(403);
 mocks.actor.mockResolvedValueOnce({organizationId,authProvider:'presentation-demo'});expect((await GET(request())).status).toBe(403);
 expect(mocks.request).not.toHaveBeenCalled();expect(mocks.actor).toHaveBeenCalledWith(expect.anything(),'intelligence:read');
});
it('resolves in process without a worker and keeps direct person/IP lookup unavailable',async()=>{
 vi.stubEnv('INTEL_API_TOKEN','');const local=await GET(request());expect(local.status).toBe(200);
 expect((await local.json()).nodes).toHaveLength(1);expect(mocks.resolve).toHaveBeenCalledWith('Test Company',{});
 vi.stubEnv('INTEL_API_TOKEN','synthetic-dedicated-entity-token-long-enough');
 for(const type of ['person','ip','unknown'])expect((await GET(request(type))).status).toBe(400);
 expect(mocks.request).not.toHaveBeenCalled();
});
it('projects bounded reference fields, excludes unreviewed people and marks source dates unknown',async()=>{
 mocks.request.mockResolvedValueOnce(JSON.stringify({privateSecret:'must-not-return',nodes:[
  {id:'company:child',label:'Child',type:'company',properties:{source:'Wikidata',privateSecret:'must-not-return'}},
  {id:'person:private',label:'Unreviewed person',type:'person'},
  {id:'person:public',label:'Public-role fixture',type:'person',properties:{role:'CEO',source:'Wikidata'}}],
  links:[{source:'company:Test Company',target:'company:child',label:'PARENT ORG'},{source:'company:Test Company',target:'person:private',label:'PRIVATE'}]}));
 const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
 const body=await response.json();expect(body.nodes).toHaveLength(2);expect(body.links).toHaveLength(1);expect(body.sourcePublishedAt).toBeNull();
 expect(JSON.stringify(body)).not.toMatch(/must-not-return|Unreviewed person/);
 expect(mocks.request.mock.calls[0][0].headers.Authorization).toBe('Bearer synthetic-dedicated-entity-token-long-enough');
 expect(mocks.request.mock.calls[0][0].url).toContain('/resolve?type=company&id=Test+Company');
});
it('sanitizes worker configuration and transport failures',async()=>{
 vi.stubEnv('INTEL_URL','https://user:private-secret@worker.example');const invalid=await GET(request());expect(invalid.status).toBe(503);expect(await invalid.text()).not.toContain('private-secret');
 vi.stubEnv('INTEL_URL','http://worker:4000');mocks.request.mockRejectedValueOnce(new Error('private-secret-response'));
 const failed=await GET(request());expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('private-secret');
});

it('retains the serverless missing-URL regression without trying a Docker hostname',async()=>{
 vi.stubEnv('VERCEL','1');vi.stubEnv('INTEL_URL','');
 const response=await GET(request());expect(response.status).toBe(200);
 expect(mocks.resolve).toHaveBeenCalled();
 expect(mocks.request).not.toHaveBeenCalled();
});
