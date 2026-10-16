import assert from 'node:assert/strict';
import sharp from 'sharp';

// Run only inside the disposable, network-blocked presentation test server.
export async function checkTools({browser,url,owner,save,output,pass}) {
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  const errors=[],requests=[];
  await context.route('**/*',async route=>{
    const target=new URL(route.request().url());
    // Offline geography fixture, never a request to a third-party tile service.
    if(target.href==='https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json') return route.fulfill({json:{version:8,sources:{countries:{type:'geojson',data:url+'/presentation/countries.geojson'}},layers:[{id:'ocean',type:'background',paint:{'background-color':'#2b343b'}},{id:'land',type:'fill',source:'countries',paint:{'fill-color':'#0a0b0e'}},{id:'borders',type:'line',source:'countries',paint:{'line-color':'#677178','line-width':1}}]}});
    if(target.origin!==url && !target.href.startsWith('data:'))return route.fulfill({status:204,body:''});
    if(target.origin===url && target.pathname.startsWith('/api/') && !target.pathname.startsWith('/api/presentation/')) {
      requests.push(target.pathname);
      assert.ok(!['/api/scanner','/api/osint/sweep'].includes(target.pathname),'Opening tools must never submit active scans');
      const data=target.pathname==='/api/osint/shodan'
        ? {ip:'192.0.2.10',ports:[443],hostnames:['demo.invalid'],tags:[],vulns:[],cpes:[]}
        : {commercial_flights:[],private_flights:[],private_jets:[],military_flights:[],ships:[],ports:[],chokepoints:[],cameras:[],satellites:[],news:[],events:[],earthquakes:[],fires:[],weather_events:[],infrastructure:[],gdelt:[],live_feeds:[],malware_threats:[],layers:[],results:[],domains:[],hotspots:[],quality:{},stats:{},sources:[],alerts:[],items:[]};
      return route.fulfill({json:data});
    }
    return route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  const choose=async label=>{
    await page.getByText('Intelligence tools',{exact:true}).click();
    const name=new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?: |$)');
    await page.getByRole('navigation',{name:'Intelligence tools'}).getByRole('button',{name}).click();
  };
  try {
    await save({pin:'6294'});
    await page.goto(url+'/presentation?view=map',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.fullscreenElement));
    await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
    await page.waitForFunction(()=>!document.fullscreenElement);
    pass('Fullscreen enters and exits using the real browser API');
    await choose('Shodan IP lookup');
    await page.getByRole('dialog',{name:'Enter switch PIN'}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/presentation');
    await page.getByLabel('Switch PIN',{exact:true}).fill('6294');
    await page.getByRole('button',{name:'Open full platform',exact:true}).click();
    await page.waitForURL('**/atlas?tool=shodan**');
    await page.getByPlaceholder('IP address',{exact:true}).waitFor();
    await page.getByPlaceholder('IP address',{exact:true}).fill('192.0.2.10');
    await page.getByRole('button',{name:'LOOKUP',exact:true}).click();
    await page.getByText('SHODAN IOT INTELLIGENCE',{exact:true}).waitFor();
    assert.equal(requests.filter(path=>path==='/api/osint/shodan').length,1);
    await page.screenshot({path:`${output}/screenshots/shodan-tools.png`});
    pass('Tool navigation preserves selected destination through PIN; Shodan uses one mocked read-only backend lookup');
    await context.addCookies([{name:'ophanim_session',value:owner,url}]);
    for(const [label,tool,selector] of [
      ['Analyst','analyst','text=OPHANIM ANALYST'],
      ['Fusion','fusion','text=SIGNAL POSTURE'],
      ['Recon','recon','input[placeholder="IP or hostname"]'],
      ['Markets','markets','text=COMMODITIES'],
      ['Alerts','alerts','text=LIVE ALERTS'],
      ['Entities','entities','text=[ OPHANIM // ENTITY INTEL ]'],
      ['Search','search','.ophanim-context-rail input'],
      ['IP search','ip','.ophanim-context-rail input'],
      ['Vessels & aircraft','tracking','.ophanim-context-rail input'],
    ]) {
      await choose(label);
      await page.waitForURL(new RegExp(`/atlas\\?tool=${tool}`));
      await page.locator(selector).first().waitFor();
    }
    await page.waitForTimeout(1800);
    assert.equal(new URL(page.url()).searchParams.get('tool'),'tracking','Layer URL persistence must retain tool selection');
    const layers=new URL(page.url()).searchParams.get('layers').split(',');
    assert.ok(layers.includes('flights') && layers.includes('maritime'));
    await page.getByRole('button',{name:'Back to map',exact:true}).click();
    await page.waitForURL('**/presentation**');
    await page.getByTestId('presentation-map').waitFor();
    await page.getByRole('button',{name:'Full platform',exact:true}).click();
    await page.getByRole('dialog',{name:'Enter switch PIN'}).waitFor();
    await page.getByLabel('Switch PIN',{exact:true}).fill('6294');
    await page.getByRole('button',{name:'Open full platform',exact:true}).click();
    await page.waitForURL('**/atlas?tool=tracking**');
    pass('All original Atlas tool panels open; vessels/aircraft layers and return destination are retained');
    await page.goto(url+'/logistics/map?view=full',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Ophanim live',exact:true}).click();
    const workspace=page.getByTestId('operational-map-workspace');
    for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]) {
      await page.setViewportSize(viewport);
      await workspace.getByRole('button',{name:'Fullscreen map',exact:true}).click();
      await page.waitForFunction(()=>document.fullscreenElement?.getAttribute('data-testid')==='operational-map-workspace');
      assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement.querySelector('.ops-sidebar,.ops-topbar,[aria-label="Presentation view"]'))),false);
      const box=await workspace.boundingBox();
      assert.ok(Math.abs(box.width-viewport.width)<2 && Math.abs(box.height-viewport.height)<2,'Only the map workspace fills the screen');
      assert.equal(await workspace.locator('.world-map-layer-rail').isVisible(),true);
      const canvas=workspace.locator('canvas.maplibregl-canvas');
      await canvas.waitFor();
      await page.waitForFunction(()=>{
        const root=document.fullscreenElement,canvas=root?.querySelector('canvas.maplibregl-canvas'),parent=root?.querySelector('.world-map-canvas');
        return canvas && parent && Math.abs(canvas.clientWidth-parent.clientWidth)<2 && Math.abs(canvas.clientHeight-parent.clientHeight)<2;
      });
      const {data,info}=await sharp(await canvas.screenshot()).raw().toBuffer({resolveWithObject:true});
      const colors=new Set();for(let y=20;y<info.height;y+=20)for(let x=20;x<info.width;x+=20){const i=(y*info.width+x)*info.channels;colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);}
      assert.ok(colors.size>3,'Fullscreen globe must not be a blank canvas');
      await page.screenshot({path:`${output}/screenshots/map-only-fullscreen-${viewport.width}.png`});
      await workspace.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
      await page.waitForFunction(()=>!document.fullscreenElement);
    }
    await workspace.getByRole('button',{name:'Fullscreen map',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.fullscreenElement));
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.fullscreenElement);
    await page.getByRole('button',{name:'Back to map',exact:true}).waitFor();
    pass('Ophanim live map-only fullscreen hides outer navigation, preserves layers, resizes the globe and exits by button/Escape at desktop and laptop sizes');
    assert.equal(errors.length,0,errors.join('\n'));
    pass('No uncaught errors opening Atlas tools; no live scan submitted');
  } catch (error) {
    await page.screenshot({path:`${output}/screenshots/failed-tools.png`,timeout:5000}).catch(()=>{});
    error.message += `\nTool browser errors: ${errors.join('; ')}`;
    throw error;
  } finally {
    await context.close();
    await save({pin:null});
  }
}
