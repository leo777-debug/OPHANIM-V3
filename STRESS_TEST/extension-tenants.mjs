import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';
if(!process.argv.includes('--extension-fixture'))process.argv.push('--extension-fixture');
await withIsolatedApp(async({base,root})=>{
  const tenants=JSON.parse(await readFile(resolve(root,'STRESS_TEST/runtime/tenant-context.json'),'utf8'));
  const origin=`chrome-extension://${'a'.repeat(32)}`,path=base+'/api/extension/context',checks=[];
  const call=async(tenant,value,source=origin)=>{
    const response=await fetch(path,{method:'POST',headers:{Origin:source,'Content-Type':'application/json',...(tenant?{Cookie:`ophanim_session=${tenant.token}`}:{})},body:JSON.stringify({page:{url:'https://synthetic.example.test',title:'Synthetic page'},entities:[{type:'shipment_reference',value}]})});
    return {response,body:await response.json()};
  };
  const preflight=await fetch(path,{method:'OPTIONS',headers:{Origin:origin}});checks.push({check:'configured extension preflight',pass:preflight.status===204 && preflight.headers.get('access-control-allow-origin')===origin});
  for(let index=0;index<2;index++){
    const own=tenants[index],other=tenants[1-index];
    const control=await call(own,own.marker);checks.push({check:'authenticated own shipment matches in configured extension',pass:control.response.status===200 && control.body.primaryShipment?.id===own.records.shipment && control.response.headers.get('access-control-allow-origin')===origin});
    const foreign=await call(own,other.marker);checks.push({check:'foreign reference returns no private shipment or impact',pass:foreign.response.status===200 && foreign.body.primaryShipment===null && foreign.body.relatedShipments?.length===0 && foreign.body.cards?.length===0});
    const denied=await call(own,own.marker,`chrome-extension://${'b'.repeat(32)}`);checks.push({check:'unlisted extension cannot read authenticated private context',pass:denied.response.status===403 && !denied.response.headers.has('access-control-allow-origin')});
  }
  const anonymous=await call(null,tenants[0].marker);checks.push({check:'listed extension still requires login',pass:anonymous.response.status===401});
  const crossSite=await call(tenants[0],tenants[0].marker,'https://untrusted.example.test');checks.push({check:'ordinary cross-site page rejected',pass:crossSite.response.status===403});
  await writeFile(resolve(root,'STRESS_TEST/artifacts/extension-tenants.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Actual loopback HTTP and two synthetic organizations; not an installed Chrome extension integration test.',checks},null,2));
  console.log(JSON.stringify({passed:checks.filter(item=>item.pass).length,failed:checks.filter(item=>!item.pass)}));
  if(checks.some(item=>!item.pass))process.exitCode=1;
},{databaseArgs:['--tenant-fixtures'],standalone:true});
