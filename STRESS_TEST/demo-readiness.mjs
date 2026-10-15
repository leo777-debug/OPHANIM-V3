import { chromium } from '@playwright/test';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async({base,root})=>{
  const demo=JSON.parse(await readFile(resolve(root,'STRESS_TEST/runtime/demo-context.json'),'utf8'));
  const checks=[],timings=[];
  const start=performance.now();
  const response=await fetch(base+'/verify');await response.text();
  timings.push({step:'cold server Verify HTML',elapsedMs:Math.round(performance.now()-start),targetMs:2000});
  const csp=response.headers.get('content-security-policy')??'';
  const scripts=csp.split(';').map(value=>value.trim().split(/\s+/)).find(parts=>parts[0]==='script-src')??[];
  checks.push({check:'production CSP rejects eval and arbitrary HTTPS scripts',pass:csp.includes("object-src 'none'") && scripts.length>1 && !scripts.includes("'unsafe-eval'") && !scripts.includes('https:')});
  checks.push({check:'production response hardening headers',pass:response.headers.get('x-content-type-options')==='nosniff' && Boolean(response.headers.get('strict-transport-security')) && response.headers.get('x-frame-options')==='SAMEORIGIN'});
  for(const path of ['/.env.local','/STRESS_TEST/runtime/tenant-context.json','/api/debug']){
    const hidden=await fetch(base+path);checks.push({check:`private/debug path unavailable: ${path}`,status:hidden.status,pass:hidden.status===404});
  }
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [390,1920]){
      const context=await browser.newContext({viewport:{width,height:1080}});
      await context.addCookies([{name:'ophanim_session',value:demo.token,url:base,httpOnly:true,sameSite:'Lax'}]);
      await context.route('**/*',route=>new URL(route.request().url()).origin===base || ['data:','blob:'].includes(new URL(route.request().url()).protocol)?route.continue():route.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));
      for(const path of ['/verify','/imports','/logistics/command','/knowledge']){
        const began=performance.now();await page.goto(base+path,{waitUntil:'domcontentloaded'});
        await page.getByRole('status',{name:'Synthetic demo replay',exact:true}).waitFor();
        await page.locator('main').first().waitFor();
        timings.push({step:`${width}px ${path} shell and replay label`,elapsedMs:Math.round(performance.now()-began),targetMs:2000});
        const label=await page.getByRole('status',{name:'Synthetic demo replay',exact:true}).innerText();
        checks.push({check:`${width}px ${path} explicit replay and no overflow`,pass:label.includes('Not live data') && label.includes('UTC') && !await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      }
      await page.goto(base+'/verify');await page.getByText('Loading history...', {exact:true}).waitFor({state:'hidden'});
      const began=performance.now();await page.getByRole('button',{name:'Tokyo earthquake',exact:true}).click();
      const result=page.getByRole('article',{name:'Verification result'});await result.waitFor();
      timings.push({step:`${width}px local replay result`,elapsedMs:Math.round(performance.now()-began),targetMs:1000});
      checks.push({check:`${width}px Verify works with all internet requests blocked`,pass:(await result.innerText()).includes('CONFIRMED')});
      checks.push({check:`${width}px demo path has no uncaught browser exceptions`,pass:errors.length===0,errors});
      await page.screenshot({path:resolve(root,`STRESS_TEST/artifacts/demo-readiness-${width}.png`),fullPage:true});
      await context.close();
    }
  }finally{await browser.close();}
  for(const timing of timings)timing.withinBudget=timing.elapsedMs<timing.targetMs;
  await writeFile(resolve(root,'STRESS_TEST/artifacts/demo-readiness.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Local fixture demo, no external network. Not a cached service-worker app with the local server offline.',checks,timings},null,2));
  console.log(JSON.stringify({passed:checks.filter(item=>item.pass).length,failed:checks.filter(item=>!item.pass),timings}));
  if(checks.some(item=>!item.pass))process.exitCode=1;
},{standalone:true});
