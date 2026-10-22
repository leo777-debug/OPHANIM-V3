// Disposable authenticated browser/API/worker/database verification. No live keys.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {startTestDatabase} from '../presentation/test-db.mjs';
const db=await startTestDatabase(55462),port=3118,base=`http://127.0.0.1:${port}`,secret=randomBytes(32).toString('hex');
// Synthetic router exercises the real API/storage/globe integration, not map accuracy.
const router=createServer(async(req,res)=>{
 let body='';for await(const part of req)body+=part;
 const input=JSON.parse(body);assert.equal(input.costing,'truck');assert.equal(input.costing_options.truck.weight,32);
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:'Ok',routes:[{distance:2500,duration:300,geometry:{type:'LineString',coordinates:input.locations.map(p=>[p.lon,p.lat])}}]}));
}).listen(18083,'127.0.0.1');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(KEY|SECRET|TOKEN|PASSWORD|SUPABASE|DATABASE_URL|APP_URL)/i.test(k)));
Object.assign(env,{DATABASE_URL:db.url+'?sslmode=disable',FORECAST_WORKER_URL:'http://127.0.0.1:18082',FORECAST_WORKER_TOKEN:secret,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'production',APP_URL:base,NODE_OPTIONS:`--import "${new URL('../presentation/network-guard.mjs',import.meta.url).href}"`});
env.ROAD_ROUTER_URL='http://127.0.0.1:18083';
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
const worker=spawn(process.env.FORECAST_TEST_PYTHON??(process.platform==='win32'?'.venv-forecast/Scripts/python.exe':'python3'),['forecast-worker/service.py'],{env:{...env,PORT:'18082',MODEL_ROOT:'.forecast-test-models'},stdio:['ignore','pipe','pipe'],windowsHide:true});
const logs=[];for(const proc of [app,worker])for(const stream of [proc.stdout,proc.stderr])stream.on('data',b=>logs.push(b.toString()));
let browser;const checks=[];
const request=async(path,{method='GET',body,token=db.sessions.owner,origin=base}={})=>fetch(base+path,{method,headers:{Origin:origin,...(token?{Cookie:`ophanim_session=${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});
try{
 for(let i=0;i<90;i++){try{if((await fetch(base+'/api/watchtower')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));if(i===89)throw new Error('App startup failed: '+logs.join(''));}
 for(let i=0;i<90;i++){try{if((await fetch('http://127.0.0.1:18082/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));if(i===89)throw new Error('Worker startup failed: '+logs.join(''));}
 const response=await request('/api/logistics/shipments',{method:'POST',body:{shipmentReference:'ROUTE LENS SYNTHETIC TEST',originPortCode:'AEJEA',destinationPortCode:'AEFJR',plannedArrivalAt:new Date(Date.now()+2*86400000).toISOString(),currentStatus:'booked'}});
 assert.equal(response.status,201,await response.clone().text());const shipment=(await response.json()).shipment;
 const receipts=await request('/api/forecasts/receipts',{token:null});assert.equal(receipts.status,200);assert.deepEqual((await receipts.json()).receipts,[]);
 const lensResponse=await request(`/api/route-lens?shipment=${shipment.id}`);assert.equal(lensResponse.status,200,await lensResponse.clone().text());const lens=await lensResponse.json();assert.equal(lens.ports.length,2);assert.ok(lens.layers.some(l=>l.geometry==='line'&&l.source.features.length));checks.push('Authenticated shipment → existing sea network → corridor layers');
 const cold=await request('/api/forecasts',{method:'POST',body:{shipmentId:shipment.id}});const coldBody=await cold.json();console.log('Cold-start API:',cold.status,JSON.stringify(coldBody));assert.equal(cold.status,200);assert.equal(coldBody.status,'withheld');
 assert.equal((await request('/api/forecasts',{method:'POST',body:{shipmentId:shipment.id},origin:'https://evil.invalid'})).status,400);
 assert.ok([401,403].includes((await request(`/api/forecasts?shipment=${shipment.id}`,{token:null})).status));checks.push('Anonymous read and foreign-origin write rejected');
 const legacyCamera=await request('/api/watchtower?port=OMMNQ&dead=1',{token:null});assert.equal(legacyCamera.status,200);assert.ok((await legacyCamera.json()).feeds.some(f=>f.id==='muscat-aida-darglobal'));
 const bookmark=await request('/watchtower?port=IRBND',{token:null});assert.equal(bookmark.status,307);assert.equal(new URL(bookmark.headers.get('location'),base).pathname,'/logistics/map');
 assert.equal((await request('/api/watchtower/health',{method:'POST',token:null})).status,401);assert.equal((await request('/api/dark-web/exposure',{method:'POST',token:null})).status,401);
 const horizon=new Date(Date.now()+3000).toISOString();
 const analystResponse=await request('/api/forecasts',{method:'POST',body:{question:'Will this synthetic public test resolve?',horizon,probability:.7,sourceUrl:'https://example.invalid/test-evidence',rationale:'Synthetic contract test only.'}});
 assert.equal(analystResponse.status,201,await analystResponse.clone().text());const analyst=(await analystResponse.json()).forecast;
 const analystList=await request('/api/forecasts/analyst');assert.ok((await analystList.json()).forecasts.some(f=>f.id===analyst.id));
 await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(horizon)-Date.now()+30)));
 const resolution=await request('/api/forecasts',{method:'PATCH',body:{id:analyst.id,outcome:true,sourceUrl:'https://example.invalid/test-resolution'}});assert.equal(resolution.status,200,await resolution.clone().text());assert.ok(Math.abs((await resolution.json()).forecast.brierScore-.09)<1e-8);
 checks.push('Legacy analyst API and named analyst route create/list/resolve on the Panel ledger; Watchtower bookmark/detail contract and protected cron routes retained');
 const jobResponse=await request('/api/jobfiles',{method:'POST',body:{mode:'sea_import',jobNumber:'SYNTHETIC-INTEGRATION-JOB',origin:'AEJEA',destination:'AEFJR',references:[{type:'awb',value:'176-12345675'}]}});
 assert.equal(jobResponse.status,201,await jobResponse.clone().text());const job=(await jobResponse.json()).job;
 assert.ok(job.shipmentId);
 const sync=await request('/api/dark-web/entities/sync',{method:'POST'});assert.equal(sync.status,200,await sync.clone().text());assert.equal((await sync.json()).synchronized.jobFiles,1);
 const entity=(await db.db.query("select e.id from ophanim_entities e join ophanim_entity_aliases a on a.entity_id=e.id where e.attributes->>'shipmentId'=$1 and a.identifier_type='awb' and replace(a.identifier_value,'-','')='17612345675'",[job.shipmentId])).rows[0];assert.ok(entity,'AWB key ring is linked to the shipment entity');
 const mention=(await db.db.query("insert into ophanim_dark_web_mentions(organization_id,provider_id,provider_document_id,source_category,source_name,first_seen_at,last_seen_at,original_text,content_hash,source_reliability,threat_categories) values($1,'synthetic-integration','synthetic-one','defensive_threat_feed','SYNTHETIC TEST ONLY',now(),now(),'Synthetic cargo theft summary',repeat('a',64),50,'[\"cargo_theft\"]') returning id",['10000000-0000-4000-8000-000000000001'])).rows[0].id;
 await db.db.query("insert into ophanim_mention_entity_matches(mention_id,entity_id,match_method,matched_text,confidence_contribution) values($1,$2,'exact_client_identifier','17612345675',100)",[mention,entity.id]);
 for(const parameter of [`jobFileId=${job.id}`,`shipmentId=${job.shipmentId}`,`shipment=${job.shipmentId}`]){
  const corridor=await request(`/api/dark-web/corridor?${parameter}`);assert.equal(corridor.status,200);const data=await corridor.json();assert.ok(data.mentions.some(m=>m.id===mention));assert.equal(data.features.dw_mention_count,1);assert.ok(Array.isArray(data.assessments));assert.ok(data.mentions[0].why.length);
 }
 await db.db.query("update ophanim_dark_web_mentions set review_status='false_positive' where id=$1",[mention]);
 assert.equal((await (await request(`/api/dark-web/corridor?jobFileId=${job.id}`)).json()).features.dw_mention_count,0);
 checks.push('Job key ring → shared entity graph → all corridor API contracts; source/match explanations and false-positive exclusion retained');
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'ophanim_session',value:db.sessions.owner,url:base}]);
 const page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(`${base}/logistics/map?tool=watchtower&port=IRBND`);await page.getByRole('heading',{name:'Watchtower',exact:true}).waitFor();await page.getByRole('button',{name:/Bandar Abbas/}).click();await page.getByText(/no lawful public feed verified/).waitFor();
 await mkdir('docs/screenshots/route-lens',{recursive:true});await page.screenshot({path:'docs/screenshots/route-lens/watchtower.png'});checks.push('Browser Watchtower search displays Iranian coverage gap');
 await page.goto(`${base}/logistics/map?tool=watchtower&port=OMMNQ`);await page.getByRole('button',{name:/Muscat \/ Mina Qaboos/}).click();
 await page.getByText(/NOT Mina Qaboos cargo berths/).waitFor();await page.getByRole('button',{name:'Open reviewed public player / fullscreen'}).click();
 await page.locator('iframe[src="https://www.youtube.com/embed/lgQ8-E3rJ_4"]').first().waitFor({state:'attached'});
 checks.push('Reviewed Muscat coastal player opens with explicit non-berth coverage; live playback audited separately using public IFrame API');
 await page.goto(`${base}/logistics/map?tool=route-lens&shipment=${shipment.id}`);await page.getByRole('heading',{name:'Route Lens',exact:true}).waitFor();await page.getByRole('button',{name:'Centre route'}).click();await page.getByTestId('presentation-globe').and(page.locator('[data-ready=true]')).waitFor({timeout:60000});await page.getByRole('button',{name:'Centre route'}).click();await page.waitForTimeout(2500);await page.getByRole('button',{name:'Forecast this route'}).click();await page.getByText(/No reference class with 30/).waitFor();
 await page.getByText('Depot and truck legs (0/2)',{exact:true}).click();
 await page.getByLabel('Depot address or coordinates').fill('25.02,55.04');await page.getByRole('button',{name:'Find depot',exact:true}).click();await page.getByRole('radio',{name:/25.02,55.04/}).check();
 await page.getByLabel('Public port gate address or coordinates').fill('25.01,55.06');await page.getByRole('button',{name:'Find public port gate',exact:true}).click();await page.getByRole('radio',{name:/25.01,55.06/}).check();
 await page.getByRole('button',{name:'Calculate and save truck leg'}).click();await page.getByText(/Truck planning route saved/).waitFor();await page.getByText('Depot and truck legs (1/2)',{exact:true}).waitFor();
 const afterRoad=await (await request(`/api/route-lens?shipment=${shipment.id}`)).json();assert.equal(afterRoad.roadLegs.length,1);assert.ok(afterRoad.layers.some(l=>l.id==='route-lens-road-origin'));
 const legBody={shipmentId:shipment.id,side:'origin',from:{label:'Test depot',lat:25.02,lon:55.04},to:{label:'Test gate',lat:25.01,lon:55.06},truck:{height:4,width:2.5,length:16.5,weight:32,hazmat:false}};
 assert.equal((await request('/api/route-lens/road',{method:'POST',body:legBody,token:db.sessions.viewer})).status,403);
 assert.equal((await request('/api/route-lens/road',{method:'POST',body:legBody,origin:'https://evil.invalid'})).status,400);
 await db.db.query("insert into ophanim_organizations(id,name,slug) values('90000000-0000-4000-8000-000000000001','SYNTHETIC OTHER TENANT','road-other-tenant')");
 await db.db.query("insert into ophanim_shipments(id,organization_id,shipment_reference) values('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','SYNTHETIC FOREIGN SHIPMENT')");
 assert.equal((await request('/api/route-lens/road',{method:'POST',body:{...legBody,shipmentId:'90000000-0000-4000-8000-000000000002'}})).status,404);
 checks.push('Browser selects depot/gate → truck router stub → tenant route metadata → globe road layer; viewer and foreign-origin mutations denied');
 await page.getByLabel('Your probability (%)').fill('70');await page.getByLabel('Reasoning / correction').fill('Synthetic operator test: confirm paperwork before the deadline.');await page.getByRole('button',{name:'Stamp my call'}).click();await page.getByText(/Your probability is stamped/).waitFor();
 assert.equal((await db.db.query("select count(*)::int as n from ophanim_forecasts where source_type='human' and shipment_id=$1",[shipment.id])).rows[0].n,1);checks.push('Evidence view → Python cold-start withholding → human call persisted in immutable ledger');
 await page.getByRole('heading',{name:'Route Lens',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/route-lens/route-lens.png'});
 assert.deepEqual(pageErrors,[]);checks.push('No browser runtime exceptions');
 await writeFile('tools/forecast/browser-report.json',JSON.stringify({syntheticFixturesOnly:true,checkedAt:new Date().toISOString(),checks},null,2));console.log('PASS: '+checks.join('; '));
}catch(error){console.error(logs.slice(-5).join(''));throw error;}
finally{await browser?.close();router.close();for(const proc of [app,worker])proc.kill();await Promise.all([app,worker].map(proc=>proc.exitCode===null?new Promise(r=>proc.once('exit',r)):Promise.resolve()));await db.stop();}
