import { describe,it,expect } from 'vitest';
import { mkdir,writeFile } from 'node:fs/promises';
import { findWarSanctionsVessels } from '@/lib/war-sanctions';
import { indexSize } from '@/lib/sanctions';
import { hibpProvider } from '@/lib/dark-web/hibp-provider';

// Explicit manual audit; no tenant queries, credentials, records or model changes.
describe.skipIf(process.env.RUN_PUBLIC_SOURCE_CHECKS!=='1')('public-source live audit',()=>{
 it('records real adapter parsing, public metadata reachability and credential gaps',async()=>{
  const checks:Array<Record<string,unknown>>=[];
  async function check(provider:string,run:()=>Promise<Record<string,unknown>>){
   try{checks.push({provider,...await run()});}catch(error){checks.push({provider,status:'unavailable',reason:error instanceof Error?error.message:'Request failed'});}
  }
  await check('gur',async()=>{
   const robots=await fetch('https://war-sanctions.gur.gov.ua/robots.txt',{signal:AbortSignal.timeout(10000)});
   if(!robots.ok)throw new Error('Robots unavailable; no catalogue requests made.');
   const policy=await robots.text();
   if(/Disallow:\s*\/\s*(?:\n|$)/i.test(policy)||/Disallow:\s*\/en(?:\/transport)?\s*(?:\n|$)/i.test(policy))throw new Error('Robots disallows catalogue paths.');
   const vessels=await findWarSanctionsVessels('',AbortSignal.timeout(25000));
   if(!vessels.some(v=>/^\d{7}$/.test(v.imo??'')))throw new Error('Public page reachable but no valid vessel IMO parsed.');
   return {status:'parsed',n:vessels.length,imoCount:vessels.filter(v=>/^\d{7}$/.test(v.imo??'')).length,source:'https://war-sanctions.gur.gov.ua/en/transport/ships',commercialUse:'still requires source terms review; production gate unchanged'};
  });
  await check('opensanctions',async()=>{
   const n=await indexSize();if(n<100)throw new Error('Published CSV has unexpectedly few parsed rows.');
   return {status:'parsed',n,source:'https://data.opensanctions.org/datasets/latest/us_ofac_sdn/targets.simple.csv',commercialUse:'Licence required; no commercial enablement inferred from test'};
  });
  await check('hibp-public-metadata',async()=>{
   const response=await fetch('https://haveibeenpwned.com/api/v3/latestbreach',{headers:{'User-Agent':'Ophanim defensive provider connectivity audit'},redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const metadata=await response.json();if(typeof metadata.Name!=='string')throw new Error('Unexpected public metadata schema.');
   return {status:'reachable',http:response.status,customerExposureTested:false,source:'https://haveibeenpwned.com/api/v3/latestbreach'};
  });
  checks.push({provider:'hibp-domain',status:hibpProvider.validateConfiguration().valid?'not_exercised':'not_configured',customerExposureTested:false,reason:'No verified tenant domain or subscription supplied. API keys intentionally blank.'});
  const report={checkedAt:new Date().toISOString(),productionEnablement:false,tenantRecordsRead:0,checks};
  await mkdir('docs/verification',{recursive:true});await writeFile('docs/verification/public-sources.json',JSON.stringify(report,null,2)+'\n');
  expect(checks).toHaveLength(4);console.log(JSON.stringify(report,null,2));
 },90000);
});
