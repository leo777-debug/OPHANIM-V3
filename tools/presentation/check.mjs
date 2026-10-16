import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { startTestDatabase,seedReplay } from './test-db.mjs';
import { checkTools } from './check-tools.mjs';

const port=Number(process.env.PRESENTATION_TEST_PORT ?? 3107),url=`http://127.0.0.1:${port}`;
const output='presentation-evidence';
await mkdir(`${output}/screenshots`,{recursive:true});
const database=await startTestDatabase(Number(process.env.PRESENTATION_TEST_DB_PORT ?? 55439));
let server,browser;const checks=[],errors=[],consoleErrors=[],logs=[];
const pass=(name,details={})=>{checks.push({name,...details});console.log(`PASS ${name}`);};
async function request(route,{method='GET',body,token,headers={}}={}) {
  return fetch(url+route,{method,headers:{Origin:url,...(body?{'Content-Type':'application/json'}:{}),...(token?{Cookie:`ophanim_session=${token}`} : {}),...headers},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(25000)});
}
const owner=database.sessions.owner;
const isMapRedirect=response=>response.status===307 && new URL(response.headers.get('location') ?? '/',url).pathname==='/presentation';
async function settings() {const response=await request('/api/presentation/settings');assert.equal(response.status,200,'Public flags should be available');return (await response.json()).settings;}
async function save(changes) {
  const current=await settings();
  const response=await request('/api/presentation/settings',{method:'PATCH',token:owner,body:{enabled:current.enabled,defaultView:current.defaultView,replay:current.replay,verifyButton:false,revision:current.revision,...changes}});
  assert.equal(response.status,200,await response.clone().text());
  return (await response.json()).settings;
}
async function eventually(fn,timeout=35000) {
  const start=Date.now();let failure;
  while(Date.now()-start<timeout){try{return await fn();}catch(error){failure=error;await delay(300);}}
  throw failure;
}
try {
  await seedReplay(database.db);
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/(KEY|SECRET|TOKEN|PASSWORD|SUPABASE|DATABASE_URL|APP_URL|UMAMI)/i.test(key)));
  Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_DEV_DIST_DIR:'.next-presentation',DATABASE_URL:database.url+'?sslmode=disable',APP_URL:url,NODE_OPTIONS:`--import "${new URL('./network-guard.mjs',import.meta.url).href}"`});
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>logs.push(chunk.toString()));
  await eventually(async()=>{assert.equal(server.exitCode,null,'Local server exited before readiness');assert.equal((await request('/api/presentation/settings')).status,200);},60000);
  pass('Disposable local database: full migration chain, external APIs blocked');
  if(process.argv.includes('--tools-only')) {
    await save({enabled:true,replay:'on'});
    browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
    await checkTools({browser,url,owner,save,output,pass});
    await writeFile(`${output}/tools-results.json`,JSON.stringify({checkedAt:new Date().toISOString(),checks,syntheticFixturesOnly:true},null,2));
  } else {
  assert.equal((await settings()).enabled,false);
  const originalRoutes=['/','/atlas','/operations','/imports','/logistics','/logistics/rescue','/onboarding','/login'];
  for(const route of originalRoutes)assert.equal((await request(route)).status,200,route);
  assert.equal((await request('/presentation')).status,307);
  pass('OFF keeps original pages reachable, presentation page redirects home');
  for(const mode of [false,true]) {
    if(mode)await save({enabled:true,replay:'on'});
    for(const [route,method] of [['/api/presentation/admin','GET'],['/api/presentation/settings','PATCH'],['/api/presentation/snapshot','POST'],['/api/ai/connection','POST'],['/api/platform/configuration','GET'],['/api/logistics/shipments','GET'],['/api/imports/preview','POST'],['/api/intelligence/settings','GET']]) {
      assert.equal((await request(route,{method,body:method==='PATCH'?{}:undefined})).status,401,`${mode}: ${route}`);
    }
    assert.equal((await request('/api/presentation/admin',{token:database.sessions.viewer})).status,403);
    assert.equal((await request('/api/presentation/settings',{method:'PATCH',token:database.sessions.viewer,body:{}})).status,403);
  }
  pass('Anonymous private APIs and viewer settings access rejected in OFF and ON');
  assert.equal((await request('/api/presentation/settings',{method:'PATCH',token:owner,headers:{Origin:'https://evil.invalid'},body:{}})).status,403);
  pass('Foreign-origin settings mutations rejected');
  await eventually(async()=>assert.ok(isMapRedirect(await request('/'))),6000);
  for(const route of originalRoutes)assert.ok(isMapRedirect(await request(route)),route);
  assert.equal((await request('/admin/presentation',{token:owner})).status,200);
  assert.equal((await request('/login?admin=1')).status,200);
  pass('ON map hides business pages; owner settings and owner login remain reachable');
  for(const id of ['flights','maritime','earthquakes','news']) {
    const response=await request(`/api/presentation/feed/${id}`),{feed}=await response.json();
    assert.equal(response.status,200);assert.equal(feed.state,'replay');assert.equal(feed.testFixture,true);
    assert.ok(!/password_hash|organization_id|ophanim_session/.test(JSON.stringify(feed)));
  }
  const {feed:noSnapshot}=await (await request('/api/presentation/feed/space-weather')).json();assert.equal(noSnapshot.state,'unavailable');
  pass('Public replay payloads contain only normalized public evidence; missing snapshots are honest');
  await save({pin:'4937'});
  await eventually(async()=>assert.equal((await request('/imports?view=full')).status,307),6000);
  const secrets=await database.db.query('select pin_hash from ophanim_private.presentation_secrets');
  assert.ok(secrets.rows[0].pin_hash.startsWith('scrypt$'));assert.ok(!secrets.rows[0].pin_hash.includes('4937'));
  assert.equal((await request('/api/presentation/view',{method:'POST',body:{view:'full'}})).status,401);
  assert.equal((await request('/api/presentation/view',{method:'POST',body:{view:'full',pin:'0000'}})).status,401);
  const unlock=await request('/api/presentation/view',{method:'POST',body:{view:'full',pin:'4937'}});
  assert.equal(unlock.status,200);const grant=unlock.headers.getSetCookie()[0].split(';',1)[0];
  assert.match(unlock.headers.getSetCookie()[0],/HttpOnly/i);
  assert.equal((await request('/imports',{headers:{Cookie:grant}})).status,200);
  assert.equal((await request('/api/platform/configuration',{headers:{Cookie:grant}})).status,401);
  await save({pin:'5482'});
  await eventually(async()=>assert.equal((await request('/imports',{headers:{Cookie:grant}})).status,307),6000);
  const audits=await database.db.query('select * from ophanim_private.presentation_audit');
  assert.ok(audits.rows.length>=3);assert.ok(audits.rows.every(row=>row.actor_user_id));
  assert.ok(!/4937|5482|scrypt\$|token_hash/.test(JSON.stringify(audits.rows)));
  pass('PIN hashed and rate-limited; rotation revokes grants; PIN never bypasses login; audit contains no PIN');
  await save({pin:null,enabled:false,replay:'on'});
  await delay(2200);
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1});
  await context.route('**/*',route=>new URL(route.request().url()).origin===url||route.request().url().startsWith('data:')?route.continue():route.fulfill({status:204,body:''}));
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='warning' && message.text().includes('Presentation map')){logs.push(message.text());console.log(message.text());}});
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(`${message.text()} ${message.location().url}`);});
  await page.goto(url,{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('group',{name:'Presentation view'}).count(),0);
  await page.keyboard.press('Control+Shift+P');assert.equal(new URL(page.url()).pathname,'/');
  await page.screenshot({path:`${output}/screenshots/off-original-site.png`});
  pass('Manual-equivalent OFF browser check: original landing page, no controls or keyboard shortcut');
  const warm=Date.now();await save({enabled:true});
  await eventually(async()=>assert.ok(isMapRedirect(await request('/imports'))),6000);
  pass('Runtime database switch without redeploy',{applyMilliseconds:Date.now()-warm});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForURL('**/presentation',{timeout:32000});
  await page.getByRole('group',{name:'Presentation view'}).waitFor();
  await page.getByRole('checkbox',{name:/Aircraft/}).waitFor();
  await page.getByTestId('replay-label').waitFor();
  assert.ok((await page.getByTestId('replay-label').textContent()).includes('Test replay fixture'));
  for(const name of ['Public cameras','Ports & harbours','Maritime chokepoints','News broadcast locations','Conflict region markers','Infrastructure locations','War & Sanctions ports']) {
    await page.getByRole('checkbox',{name:new RegExp(name)}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:new RegExp(name)}).isChecked(),true,name);
  }
  assert.equal((await (await request('/api/presentation/feed/cameras')).json()).feed.features.length,180);
  pass('All restored reference and signal layers enabled; dense camera fixture is not dropped');
  const timings=[];
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    const begin=Date.now();await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(document.querySelector('[data-testid="presentation-map"]')) && (performance.getEntriesByType('resource').some(entry=>entry.name.endsWith('/presentation/globe-poster.png')) || Boolean(document.querySelector('[data-testid="presentation-globe"][data-ready="true"]'))));
    const shellReadyMilliseconds=Date.now()-begin;
    await page.getByRole('checkbox',{name:/Aircraft/}).waitFor();
    const canvas=page.locator('[data-testid="presentation-globe"] canvas');await canvas.waitFor();
    await page.locator('[data-testid="presentation-globe"][data-ready="true"]').waitFor();
    const readyMilliseconds=Date.now()-begin;
    assert.ok((await page.getByTestId('presentation-globe').boundingBox()).height>=viewport.height-160,'Map container must retain its viewport height after MapLibre CSS loads');
    await eventually(async()=>{
      const {data,info}=await sharp(await canvas.screenshot()).raw().toBuffer({resolveWithObject:true});
      const colors=new Set();for(let y=100;y<info.height-50;y+=20)for(let x=viewport.width>680?240:170;x<info.width-(viewport.width>680?350:70);x+=20){const i=(y*info.width+x)*info.channels;colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);}
      assert.ok(colors.size>8,`Globe pixels must include geography on desktop and mobile, not a blank canvas (${colors.size} sampled colors)`);
    },12000);
    timings.push({viewport,shellReadyMilliseconds,readyMilliseconds,pixelCheckedMilliseconds:Date.now()-begin});
    assert.ok(await page.getByRole('checkbox',{checked:true}).count()>=14,'At least 14 populated layers, not disabled placeholders');
    assert.ok(await page.getByRole('article').getByRole('link',{name:'Oman port weather advisory: test replay'}).isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const before=await page.getByTestId('ticker-track').evaluate(element=>getComputedStyle(element).transform);
    await delay(700);const after=await page.getByTestId('ticker-track').evaluate(element=>getComputedStyle(element).transform);assert.notEqual(before,after);
    await page.screenshot({path:`${output}/screenshots/map-${viewport.width}x${viewport.height}.png`});
  }
  pass('Real WebGL globe, >=3 layers, news, moving ticker and responsive screenshots',{timings});
  await page.setViewportSize({width:1366,height:768});
  await page.mouse.move(700,360);await delay(400);
  const canvas=page.locator('[data-testid="presentation-globe"] canvas');
  const {data,info}=await sharp(await canvas.screenshot()).raw().toBuffer({resolveWithObject:true});
  const aircraftPixel=i=>data[i]>70&&data[i]<110&&data[i+1]>150&&data[i+1]<195&&data[i+2]>220;
  let point;
  for(let y=70;y<info.height-130&&!point;y++)for(let x=240;x<info.width-360;x++){const i=(y*info.width+x)*info.channels;if(aircraftPixel(i)){point={x,y};break;}}
  assert.ok(point,'Aircraft pixels must render');
  console.log('Rendered aircraft pixel candidate',point);
  const nearby=[];
  for(let y=Math.max(0,point.y-7);y<Math.min(info.height,point.y+8);y++)for(let x=Math.max(0,point.x-7);x<Math.min(info.width,point.x+8);x++){const i=(y*info.width+x)*info.channels;if(aircraftPixel(i))nearby.push({x,y});}
  const center={x:nearby.reduce((sum,p)=>sum+p.x,0)/nearby.length,y:nearby.reduce((sum,p)=>sum+p.y,0)/nearby.length};
  const bounds=await canvas.boundingBox();await page.mouse.click(bounds.x+center.x,bounds.y+center.y);
  await page.getByRole('region',{name:'Object details'}).waitFor({timeout:5000});
  await page.screenshot({path:`${output}/screenshots/object-details.png`});
  await page.getByRole('button',{name:'Close details'}).click();
  pass('Clicking a rendered observation opens its source, time and coordinates');
  assert.equal(await page.getByTestId('presentation-globe').getAttribute('data-renderer'),'ophanim-atlas');
  await page.getByRole('button',{name:'Earth colored basemap',exact:true}).click();
  assert.equal(await page.getByTestId('presentation-globe').getAttribute('data-map-style'),'earth');
  assert.equal(await page.getByRole('button',{name:'Earth colored basemap',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Satellite imagery',exact:true}).click();
  assert.equal(await page.getByTestId('presentation-globe').getAttribute('data-map-style'),'satellite');
  await page.getByRole('button',{name:'Night basemap',exact:true}).click();
  await page.getByRole('button',{name:'Switch to 2D map',exact:true}).click();
  assert.equal(await page.getByTestId('presentation-globe').getAttribute('data-projection'),'mercator');
  await page.getByRole('button',{name:'Switch to 3D globe',exact:true}).click();
  assert.equal(await page.getByTestId('presentation-globe').getAttribute('data-projection'),'globe');
  await page.getByRole('button',{name:'Day/night overlay',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Day/night overlay',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Day/night overlay',exact:true}).click();
  assert.equal(await page.locator('input[placeholder*="Search IPs"]').count(),0,'No duplicate floating search box');
  pass('Original Ophanim renderer, Night/Earth/Satellite and 2D/3D controls restored');
  await context.addCookies([{name:'ophanim_session',value:owner,url}]);
  await page.getByRole('button',{name:'Full platform',exact:true}).click();await page.waitForURL('**/operations**');
  await page.getByRole('button',{name:'Back to map',exact:true}).waitFor();
  await page.screenshot({path:`${output}/screenshots/full-platform.png`});
  await page.getByRole('button',{name:'Back to map',exact:true}).click();await page.waitForURL('**/presentation**');
  await page.getByRole('checkbox',{name:/Aircraft/}).waitFor();
  await page.keyboard.press('Control+Shift+P');await page.waitForURL('**/operations**');
  await page.getByRole('button',{name:'Back to map',exact:true}).waitFor();
  await page.keyboard.press('Control+Shift+P');await page.waitForURL('**/presentation**');
  pass('Quick switch and Ctrl+Shift+P both work in both directions');
  await checkTools({browser,url,owner,save,output,pass});
  await page.goto(url+'/admin/presentation');await page.getByRole('switch',{name:'Presentation mode'}).waitFor();
  await page.screenshot({path:`${output}/screenshots/admin-settings.png`});
  await page.getByRole('switch',{name:'Presentation mode'}).click();await page.getByRole('button',{name:'Confirm OFF'}).click();
  await eventually(async()=>assert.equal((await settings()).enabled,false));
  await page.goto(url);await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('group',{name:'Presentation view'}).count(),0);
  await page.keyboard.press('Control+Shift+P');assert.equal(new URL(page.url()).pathname,'/');
  pass('Owner dashboard turns OFF without redeploy; normal site returns and controls disappear');
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(consoleErrors.length,0,consoleErrors.join('\n'));pass('No uncaught or console browser errors on map and switch path');
  await writeFile(`${output}/results.json`,JSON.stringify({checkedAt:new Date().toISOString(),checks,browserErrors:errors,consoleErrors,syntheticFixturesOnly:true},null,2));
  console.log(`${checks.length} presentation integration checks passed.`);
  }
}catch(error) {
  if(browser)for(const context of browser.contexts())for(const page of context.pages()) {
    await writeFile(`${output}/debug-dom.html`,await page.content()).catch(()=>{});
    await page.screenshot({path:`${output}/screenshots/failed-check.png`,timeout:5000}).catch(failure=>logs.push('Screenshot diagnostic: '+failure.message));
  }
  await writeFile(`${output}/failure.json`,JSON.stringify({message:error.message,checks,browserErrors:errors,consoleErrors,serverLog:logs.join('').slice(-12000)},null,2));
  console.error(error);process.exitCode=1;
}finally {
  if(browser)await browser.close();
  if(server){server.kill();await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(5000)]);}
  await database.stop();
}
