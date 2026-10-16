import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';

if(!process.argv.includes('--sdk-fixture'))throw new Error('Use --sdk-fixture for this owned synthetic ingest test.');
await withIsolatedApp(async({base,root})=>{
  const [a,b]=JSON.parse(await readFile(resolve(root,'STRESS_TEST/runtime/tenant-context.json'),'utf8'));
  const headers=(tenant)=>({Cookie:`ophanim_session=${tenant.token}`,Origin:base,'Content-Type':'application/json'});
  const checks=[];
  const check=async(name,run)=>{try{await run();checks.push({name,pass:true});}catch{checks.push({name,pass:false});}};
  for(const path of ['/api/sdk/ingest','/api/sdk/stream'])await check(`anonymous ${path} denied`,async()=>assert.ok([401,403].includes((await fetch(base+path)).status)));
  await check('service ingestion assigns configured organization, not supplied foreign organization',async()=>{
    const response=await fetch(`${base}/api/sdk/ingest`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:'synthetic-owned-sdk-fixture-only',source:'synthetic',organizationId:b.organizationId,entities:[{id:'zero',name:a.marker,position:{lat:0,lng:0}}]})});
    assert.equal(response.status,200);assert.equal((await response.json()).accepted,1);
  });
  for(const tenant of [a,b]){
    await check(`${tenant===a ? 'own':'foreign'} SDK status stays scoped`,async()=>{
      const response=await fetch(`${base}/api/sdk/ingest`,{headers:headers(tenant)});assert.equal(response.status,200);assert.equal((await response.json()).entityCount,tenant===a ? 1:0);
    });
    await check(`${tenant===a ? 'own':'foreign'} actual SSE payload stays scoped`,async()=>{
      const abort=new AbortController();let reader;
      try{
        const response=await fetch(`${base}/api/sdk/stream`,{headers:headers(tenant),signal:abort.signal});assert.equal(response.status,200);
        reader=response.body.getReader();await reader.read();
        const update=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('SSE deadline')),10000).unref())]);
        const text=new TextDecoder().decode(update.value);
        assert.equal(text.includes(a.marker),tenant===a);assert.ok(!text.includes(b.marker));
      }finally{await reader?.cancel().catch(()=>{});abort.abort();}
    });
  }
  await check('member cookie alone cannot ingest without the service credential',async()=>{
    const response=await fetch(`${base}/api/sdk/ingest`,{method:'POST',headers:headers(b),body:JSON.stringify({source:'synthetic',entities:[]})});assert.equal(response.status,401);
  });
  await writeFile(resolve(root,'STRESS_TEST/artifacts/sdk-tenants.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Owned loopback only, two synthetic organizations, no device contact or external provider',checks},null,2));
  console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).map(c=>c.name)}));
  if(checks.some(c=>!c.pass))throw new Error('SDK tenant boundary failed.');
},{databaseArgs:['--tenant-fixtures']});
