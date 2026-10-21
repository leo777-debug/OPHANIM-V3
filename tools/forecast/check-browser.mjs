// Disposable authenticated browser/API/worker/database verification. No live keys.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {startTestDatabase} from '../presentation/test-db.mjs';
const db=await startTestDatabase(55462),port=3118,base=`http://127.0.0.1:${port}`,secret=randomBytes(32).toString('hex');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(KEY|SECRET|TOKEN|PASSWORD|SUPABASE|DATABASE_URL|APP_URL)/i.test(k)));
Object.assign(env,{DATABASE_URL:db.url+'?sslmode=disable',FORECAST_WORKER_URL:'http://127.0.0.1:18082',FORECAST_WORKER_TOKEN:secret,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'production',APP_URL:base,NODE_OPTIONS:`--import "${new URL('../presentation/network-guard.mjs',import.meta.url).href}"`});
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
 assert.equal((await request(`/api/forecasts?shipment=${shipment.id}`,{token:null})).status,403);checks.push('Anonymous read and foreign-origin write rejected');
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'ophanim_session',value:db.sessions.owner,url:base}]);
 const page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(`${base}/logistics/map?tool=watchtower&port=IRBND`);await page.getByRole('heading',{name:'Watchtower',exact:true}).waitFor();await page.getByRole('button',{name:/Bandar Abbas/}).click();await page.getByText(/no lawful public feed verified/).waitFor();
 await mkdir('docs/screenshots/route-lens',{recursive:true});await page.screenshot({path:'docs/screenshots/route-lens/watchtower.png'});checks.push('Browser Watchtower search displays Iranian coverage gap');
 await page.goto(`${base}/logistics/map?tool=route-lens&shipment=${shipment.id}`);await page.getByRole('heading',{name:'Route Lens',exact:true}).waitFor();await page.getByRole('button',{name:'Centre route'}).click();await page.getByTestId('presentation-globe').and(page.locator('[data-ready=true]')).waitFor({timeout:60000});await page.getByRole('button',{name:'Centre route'}).click();await page.waitForTimeout(2500);await page.getByRole('button',{name:'Forecast this route'}).click();await page.getByText(/No reference class with 30/).waitFor();
 await page.getByLabel('Your probability (%)').fill('70');await page.getByLabel('Reasoning / correction').fill('Synthetic operator test: confirm paperwork before the deadline.');await page.getByRole('button',{name:'Stamp my call'}).click();await page.getByText(/Your probability is stamped/).waitFor();
 assert.equal((await db.db.query("select count(*)::int as n from ophanim_forecasts where source_type='human'")).rows[0].n,1);checks.push('Evidence view → Python cold-start withholding → human call persisted in immutable ledger');
 await page.getByRole('heading',{name:'Route Lens',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/route-lens/route-lens.png'});
 assert.deepEqual(pageErrors,[]);checks.push('No browser runtime exceptions');
 await writeFile('tools/forecast/browser-report.json',JSON.stringify({syntheticFixturesOnly:true,checkedAt:new Date().toISOString(),checks},null,2));console.log('PASS: '+checks.join('; '));
}catch(error){console.error(logs.slice(-5).join(''));throw error;}
finally{await browser?.close();for(const proc of [app,worker])proc.kill();await Promise.all([app,worker].map(proc=>proc.exitCode===null?new Promise(r=>proc.once('exit',r)):Promise.resolve()));await db.stop();}
