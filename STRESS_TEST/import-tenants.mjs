import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { withIsolatedApp } from './harness.mjs';
await withIsolatedApp(async({base,root})=>{
  const tenants=JSON.parse(await readFile(resolve(root,'STRESS_TEST/runtime/tenant-context.json'),'utf8'));
  const database=new Client({connectionString:'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable'});await database.connect();
  const checks=[];
  const call=async(tenant,path,data)=>{const response=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:`ophanim_session=${tenant.token}`},body:JSON.stringify(data)});return {status:response.status,body:await response.json()};};
  try{
    for(const [index,tenant] of tenants.entries()){
      tenant.previewReference=`SYNTHETIC-IMPORT-${index}`;
      const response=await call(tenant,'/api/logistics/shipments/imports/preview',{fileName:'synthetic.csv',csv:`Shipment Reference\n${tenant.previewReference}`});
      checks.push({check:'legacy JSON preview accepts a valid own shipment',pass:response.status===200 && response.body.preview?.validRows===1});
      tenant.previewId=response.body.shipmentImport?.id;if(!tenant.previewId)throw new Error('Own preview fixture failed.');
      const count=await database.query('select count(*)::int as count from ophanim_shipments where organization_id=$1 and shipment_reference=$2',[tenant.organizationId,tenant.previewReference]);
      checks.push({check:'preview creates no shipment before review confirmation',pass:count.rows[0].count===0});
    }
    for(let index=0;index<2;index++){
      const own=tenants[index],other=tenants[1-index];
      for(const prefix of ['/api/imports/','/api/logistics/shipments/imports/']){
        const denied=await call(own,`${prefix}${other.previewId}/confirm`,{});
        checks.push({check:'foreign import confirmation denied through alias '+prefix,pass:[400,403,404].includes(denied.status)});
      }
    }
    for(const tenant of tenants){
      const status=await database.query('select status from ophanim_imports where id=$1',[tenant.previewId]);checks.push({check:'foreign attempts leave preview unconfirmed',pass:status.rows[0].status==='previewed'});
      const confirmed=await call(tenant,`/api/logistics/shipments/imports/${tenant.previewId}/confirm`,{});
      const count=await database.query('select count(*)::int as count from ophanim_shipments where organization_id=$1 and shipment_reference=$2',[tenant.organizationId,tenant.previewReference]);
      checks.push({check:'own reviewed import positive control persists exactly once',pass:confirmed.status===200 && count.rows[0].count===1});
    }
    await writeFile(resolve(root,'STRESS_TEST/artifacts/import-tenants.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Actual loopback HTTP and PostgreSQL, two synthetic organizations, no external traffic.',checks},null,2));
    console.log(JSON.stringify({passed:checks.filter(item=>item.pass).length,failed:checks.filter(item=>!item.pass)}));if(checks.some(item=>!item.pass))process.exitCode=1;
  }finally{await database.end();}
},{databaseArgs:['--tenant-fixtures'],standalone:true});
