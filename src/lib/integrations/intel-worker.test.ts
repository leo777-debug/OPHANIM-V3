import {afterEach,expect,it,vi} from 'vitest';
import type {Server} from 'node:http';
const {app}=await import('../../../intel/server.js');
const {publicJson}=await import('../../../intel/policy.mjs');
let server:Server|undefined;
afterEach(async()=>{vi.unstubAllEnvs();if(server)await new Promise<void>(resolve=>{server!.close(()=>resolve());server!.closeAllConnections();});server=undefined;});
it('executes actual worker auth/health HTTP with the licensed source disabled and no direct person/IP resolver',async()=>{
 vi.stubEnv('INTEL_API_TOKEN','synthetic-entity-worker-token-long-enough');
 const local:Server=app.listen(0,'127.0.0.1');server=local;await new Promise<void>(resolve=>server!.once('listening',resolve));
 const address=local.address();if(!address||typeof address==='string')throw new Error('Fixture server missing');
 const origin=`http://127.0.0.1:${address.port}`;
 expect((await fetch(origin+'/health')).status).toBe(401);
 const headers={Authorization:'Bearer synthetic-entity-worker-token-long-enough'};
 const response=await fetch(origin+'/health',{headers});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
 const health=await response.json();expect(health.sanctions_entries).toBe(0);expect(health.sanctions_loaded_at).toBeNull();
 expect(health.sources).toContainEqual({id:'opensanctions',status:'disabled-by-licence'});
 for(const type of ['person','ip'])expect((await fetch(`${origin}/resolve?type=${type}&id=Fixture`,{headers})).status).toBe(400);
 vi.stubEnv('INTEL_API_TOKEN','');expect((await fetch(origin+'/health',{headers})).status).toBe(503);
});
it('blocks source origins, redirects to unsupported paths and arbitrary URLs before DNS',async()=>{
 for(const url of ['http://www.wikidata.org/w/api.php','https://data.opensanctions.org/datasets/latest/test','https://user:password@www.wikidata.org/w/api.php','https://127.0.0.1/w/api.php','https://www.wikidata.org/other'])await expect(publicJson(url)).rejects.toThrow('Unapproved source');
});
