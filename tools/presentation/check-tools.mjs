import assert from 'node:assert/strict';
import sharp from 'sharp';

// Disposable local database + recorded public fixtures only. No active scans.
export async function checkTools({browser,url,owner,save,output,pass}) {
  const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const errors=[],requests=[]; let inspectionSubmission=false;
  await context.route('**/*',async route=>{
    const target=new URL(route.request().url());
    if(target.origin!==url&&!target.href.startsWith('data:'))return route.fulfill({status:204,body:''});
    if(target.origin===url&&target.pathname.startsWith('/api/')&&!target.pathname.startsWith('/api/presentation/')&&!target.pathname.startsWith('/api/map/feeds/')) {
      requests.push(target.pathname);
      assert.ok(inspectionSubmission || !['/api/scanner','/api/osint/sweep'].includes(target.pathname),'Opening tools must not submit scans');
      if(target.pathname==='/api/scanner') {
        assert.equal(route.request().method(),'POST');
        assert.deepEqual(route.request().postDataJSON(),{target:'approved.example',type:'quick'});
        return requests.filter(path=>path==='/api/scanner').length===1
          ? route.fulfill({status:401,json:{error:'Authentication is required.'}})
          : route.fulfill({json:{target:'approved.example',mode:'quick',httpStatus:302,observedAt:'2026-10-21T00:00:00.000Z',headers:{server:'Synthetic fixture'},tls:{authorized:true,protocol:'TLSv1.3',validFrom:null,validTo:null},risk:'unknown',attribution:'Synthetic target response for browser verification only.',limitations:['No real target was requested.']}});
      }
      const data=target.pathname==='/api/logistics/shipments/recorded-shipment'?{shipment:{id:'recorded-shipment',originPortName:'Fixture origin port',destinationPortName:'Fixture destination port',transshipmentPorts:[]}}
        :target.pathname==='/api/osint/shodan'?{ip:'192.0.2.10',ports:[443],hostnames:['demo.invalid'],tags:[],vulns:[],cpes:[]}
        :target.pathname==='/api/search'?{results:[{id:'test-place',label:'Dubai, United Arab Emirates',type:'location',category:'geospatial',lat:25.2,lng:55.3,zoomLevel:5,source:'Recorded test fixture'}]}
        :{news:[],events:[],earthquakes:[],domains:[],hotspots:[],quality:{},stats:{},sources:[],alerts:[],items:[],watchlists:[],nodes:[],links:[]};
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
  const workspace=page.getByTestId('operational-map-workspace');
  const dock=page.getByTestId('map-tool-dock');
  async function geography() {
    const canvas=workspace.locator('canvas.maplibregl-canvas');
    await page.locator('[data-testid="presentation-globe"][data-ready="true"]').waitFor();
    const {data,info}=await sharp(await canvas.screenshot()).raw().toBuffer({resolveWithObject:true});
    const colors=new Set();for(let y=10;y<info.height;y+=12)for(let x=10;x<info.width;x+=12){const i=(y*info.width+x)*info.channels;colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);}
    assert.ok(colors.size>8,'Geography and signals must render, not a blank canvas');
  }
  try {
    await save({pin:'6294'});
    await page.goto(url+'/presentation?view=map',{waitUntil:'domcontentloaded'});
    await geography();
    await page.locator('canvas.maplibregl-canvas').evaluate(canvas=>canvas.dataset.identity='same-globe');
    await choose('Shodan IP lookup');
    await dock.getByPlaceholder('IP address',{exact:true}).fill('192.0.2.10');
    await dock.getByRole('button',{name:'LOOKUP',exact:true}).click();
    await dock.getByText('SHODAN IOT INTELLIGENCE',{exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/presentation');
    assert.equal(await page.getByRole('dialog',{name:'Enter switch PIN'}).count(),0);
    assert.equal(await page.locator('canvas.maplibregl-canvas').getAttribute('data-identity'),'same-globe');
    assert.equal(requests.filter(path=>path==='/api/osint/shodan').length,1);
    await page.screenshot({path:`${output}/screenshots/shodan-tools.png`});
    pass('Read-only Shodan opens beside the same globe, without navigation, remount or active scanning');
    const geolocationBeforeRecon=requests.filter(path=>path==='/api/osint/ip').length;
    await choose('Recon');
    await dock.getByPlaceholder('IP or hostname',{exact:true}).fill('approved.example');
    inspectionSubmission=true;
    await dock.getByRole('button',{name:'SCAN',exact:true}).click();
    await dock.getByRole('link',{name:'Sign in',exact:true}).waitFor();
    assert.equal(await dock.getByRole('link',{name:'Sign in',exact:true}).getAttribute('href'),'/login?returnTo=%2Fatlas');
    assert.equal(requests.filter(path=>path==='/api/scanner').length,1);
    assert.equal(requests.filter(path=>path==='/api/osint/ip').length,geolocationBeforeRecon,'Recon must not send approved target to background geolocation');
    assert.equal(await dock.locator('select option[value=deep]').count(),0);
    pass('Recon submits a private POST and shows sign-in recovery without background geolocation or unsupported scan modes');
    await context.addCookies([{name:'ophanim_session',value:owner,url}]);
    await dock.getByRole('button',{name:'SCAN',exact:true}).click();
    await dock.getByRole('region',{name:'Approved HTTPS observation'}).waitFor();
    await dock.getByText('Risk unknown',{exact:false}).waitFor();
    assert.equal(requests.filter(path=>path==='/api/osint/ip').length,geolocationBeforeRecon);
    await dock.getByRole('region',{name:'Approved HTTPS observation'}).screenshot({path:`${output}/screenshots/recon-observation.png`});
    pass('Recon renders dated headers/TLS evidence and unknown risk; synthetic response causes no background target disclosure');
    inspectionSubmission=false;
    for(const [label,tool,selector] of [
      ['Analyst','analyst','text=OPHANIM ANALYST'],
      ['Fusion','fusion','text=Live fusion is unavailable in replay mode.'],
      ['Recon','recon','input[placeholder="IP or hostname"]'],
      ['Markets','markets','text=COMMODITIES'],
      ['Alerts','alerts','text=LIVE ALERTS'],
      ['Entities','entities','input[aria-label="Find map entity"]'],
      ['IP search','ip','input[placeholder="IP address"]'],
      ['Vessels & aircraft','tracking','input[aria-label="Find vessel or aircraft"]'],
      ['Intel Desk','news','[role="tablist"]'],
      ['AI setup','settings','text=OPENAI-COMPATIBLE AI PROVIDER'],
      ['Watchlists','watchlists','text=Watchlists'],
      ['Sources','sources','text=Observed:'],
      ['Logistics','logistics','text=Ports and chokepoints'],
    ]) {
      await choose(label);
      await page.waitForURL(new RegExp(`/presentation\\?view=map&tool=${tool}`));
      await dock.locator(selector).first().waitFor();
      if(tool==='entities') {
        await dock.getByLabel('Matching map entities').getByRole('button').first().click();
        await dock.getByText('[ OPHANIM // ENTITY INTEL ]',{exact:true}).waitFor();
      }
      assert.equal(await page.locator('canvas.maplibregl-canvas').getAttribute('data-identity'),'same-globe',label);
    }
    pass('All intelligence tools are docked in the operational layout; replay never mixes in live fusion');
    await dock.getByRole('button',{name:'Close tool',exact:true}).click();
    await choose('Search');
    const search=page.getByTestId('global-search-input');
    await search.fill('Dubai');
    await page.getByTestId('global-search-results').getByRole('button').first().click();
    assert.equal(await page.getByTestId('global-search-input').count(),1);
    pass('A single place/IP/domain search locates results in the existing globe');
    await page.keyboard.press('Control+k');
    const palette=page.getByPlaceholder('Search layers, regions, tools, display…');
    await palette.fill('Shodan');
    await palette.press('Enter');
    await dock.getByPlaceholder('IP address',{exact:true}).waitFor();
    await dock.getByRole('button',{name:'Close tool',exact:true}).click();
    pass('The existing command palette opens tools in the same workspace');
    await workspace.getByRole('button',{name:'New globe',exact:true}).click();
    await workspace.getByRole('button',{name:'Earth colored basemap',exact:true}).click();
    await workspace.getByRole('checkbox',{name:'Aircraft',exact:true}).uncheck();
    await workspace.getByRole('tab',{name:'Global',exact:true}).click();
    assert.equal(await workspace.getByRole('button',{name:'Night basemap',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await workspace.getByRole('checkbox',{name:'Aircraft',exact:true}).isChecked(),true);
    await workspace.getByRole('tab',{name:'Globe 2',exact:true}).click();
    assert.equal(await workspace.getByRole('button',{name:'Earth colored basemap',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await workspace.getByRole('checkbox',{name:'Aircraft',exact:true}).isChecked(),false);
    await page.getByRole('button',{name:'Full platform',exact:true}).click();
    await page.getByRole('dialog',{name:'Enter switch PIN'}).waitFor();
    await page.getByLabel('Switch PIN',{exact:true}).fill('6294');
    await page.getByRole('button',{name:'Open full platform',exact:true}).click();
    await page.waitForURL('**/logistics/map**');
    await workspace.getByRole('tab',{name:'Globe 2',exact:true}).waitFor();
    assert.equal(await workspace.getByRole('button',{name:'Earth colored basemap',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await workspace.getByRole('checkbox',{name:'Aircraft',exact:true}).isChecked(),false);
    await page.getByRole('button',{name:'Back to map',exact:true}).click();
    await page.waitForURL('**/presentation**');
    await workspace.getByRole('tab',{name:'Globe 2',exact:true}).waitFor();
    assert.equal(await workspace.getByRole('checkbox',{name:'Aircraft',exact:true}).isChecked(),false);
    pass('Independent globe tabs retain layers and appearance through PIN-gated Full platform and Back to map');
    await save({pin:null});
    await page.goto(url+'/atlas?view=full&tool=tracking&lat=25&lng=55&zoom=3',{waitUntil:'domcontentloaded'});
    await page.waitForURL('**/logistics/map**');
    await dock.getByLabel('Find vessel or aircraft').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('tool'),'tracking');
    pass('Legacy Atlas links redirect to the same operational map with tool and camera parameters retained');
    await dock.getByRole('button',{name:'Close tool',exact:true}).click();
    await workspace.getByRole('button',{name:'Share map view',exact:true}).click();
    const sharedUrl=await page.getByRole('textbox',{name:'Public map view URL',exact:true}).inputValue();
    const shared=new URL(sharedUrl);
    assert.equal(shared.origin,url);
    assert.equal(shared.pathname,'/logistics/map');
    assert.equal(shared.searchParams.get('view'),'full');
    assert.equal(shared.searchParams.get('mapVersion'),'1');
    for(const field of ['shipment','token','organization','apiKey'])assert.equal(shared.searchParams.has(field),false);
    assert.ok(!shared.searchParams.get('layers').includes('sdk_'));
    await page.getByRole('button',{name:'Close map sharing',exact:true}).click();
    const sharedContext=await browser.newContext({viewport:{width:1366,height:768}});
    await sharedContext.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.fulfill({status:204,body:''}));
    try {
      const sharedPage=await sharedContext.newPage();
      sharedPage.on('pageerror',error=>errors.push(error.message));
      await sharedPage.goto(sharedUrl,{waitUntil:'domcontentloaded'});
      await sharedPage.locator('[data-testid="presentation-globe"][data-ready="true"]').waitFor();
      assert.equal(await sharedPage.getByRole('button',{name:'Earth colored basemap',exact:true}).getAttribute('aria-pressed'),'true');
      assert.equal(await sharedPage.getByRole('checkbox',{name:'Aircraft',exact:true}).isChecked(),false);
      await sharedPage.screenshot({path:`${output}/screenshots/share-restored.png`});
    } finally {await sharedContext.close();}
    pass('Generated public map link restores appearance and layers in a fresh signed-out browser without private query IDs');
    for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]) {
      await page.setViewportSize(viewport);
      await workspace.getByRole('button',{name:'Fullscreen map',exact:true}).click();
      await page.waitForFunction(()=>document.fullscreenElement?.getAttribute('data-testid')==='operational-map-workspace');
      assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement.querySelector('.ops-sidebar,.ops-topbar,[aria-label="Presentation view"]'))),false);
      const box=await workspace.boundingBox();
      assert.ok(Math.abs(box.width-viewport.width)<2&&Math.abs(box.height-viewport.height)<2);
      await page.waitForFunction(()=>{
        const root=document.fullscreenElement,canvas=root?.querySelector('canvas.maplibregl-canvas'),parent=root?.querySelector('[data-testid="unified-map-canvas"]');
        return canvas&&parent&&Math.abs(canvas.clientWidth-parent.clientWidth)<2&&Math.abs(canvas.clientHeight-parent.clientHeight)<2;
      });
      await geography();
      await workspace.getByRole('button',{name:'Share map view',exact:true}).click();
      assert.equal(await page.getByRole('textbox',{name:'Public map view URL',exact:true}).isVisible(),true,'Sharing remains visible inside the fullscreen map');
      await page.getByRole('button',{name:'Close map sharing',exact:true}).click();
      await workspace.getByRole('button',{name:'Intel Desk',exact:true}).click();
      await dock.getByRole('tab',{name:'news',exact:true}).waitFor();
      const bounds=await Promise.all([page.getByTestId('unified-map-canvas').boundingBox(),dock.boundingBox(),workspace.getByRole('complementary',{name:'Visible layers'}).boundingBox()]);
      assert.ok(bounds[0].x>=bounds[2].x+bounds[2].width-1&&bounds[1].x>=bounds[0].x+bounds[0].width-1,'Layer rail, canvas and dock must not overlap');
      await page.screenshot({path:`${output}/screenshots/unified-map-${viewport.width}.png`});
      await dock.getByRole('button',{name:'Close tool',exact:true}).click();
      await workspace.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
      await page.waitForFunction(()=>!document.fullscreenElement);
    }
    await workspace.getByRole('button',{name:'Fullscreen map',exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.fullscreenElement));await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);
    pass('Map-only fullscreen, non-overlapping rail/globe/tool dock, and button/Escape exit pass at desktop and laptop sizes');
    await page.goto(url+'/logistics/map?view=full&shipment=recorded-shipment',{waitUntil:'domcontentloaded'});
    await page.getByRole('complementary',{name:'Shipment route',exact:true}).getByText('Fixture origin port',{exact:true}).waitFor();
    assert.equal(requests.filter(path=>path==='/api/logistics/shipments/recorded-shipment').length,1);
    await page.goto(url+'/presentation?view=map&shipment=recorded-shipment',{waitUntil:'domcontentloaded'});
    await geography();
    assert.equal(requests.filter(path=>path==='/api/logistics/shipments/recorded-shipment').length,1,'Public surface must ignore private record query IDs');
    assert.equal(await page.getByRole('complementary',{name:'Shipment route',exact:true}).count(),0);
    pass('Authenticated shipment detail links still work; public Map view never fetches private query IDs');
    await page.goto(url+'/presentation?view=map',{waitUntil:'domcontentloaded'});
    await page.setViewportSize({width:390,height:844});
    await geography();
    await workspace.getByRole('button',{name:'Show layers',exact:true}).click();
    await workspace.getByLabel('Search layers',{exact:true}).fill('vessel');
    await workspace.getByRole('checkbox',{name:'Vessels',exact:true}).waitFor();
    await page.screenshot({path:`${output}/screenshots/unified-map-mobile-layers.png`});
    await workspace.getByRole('button',{name:'Show layers',exact:true}).click();
    await workspace.getByRole('button',{name:'Intel Desk',exact:true}).click();
    await dock.getByRole('tab',{name:'news',exact:true}).waitFor();
    await dock.getByRole('heading',{name:'Oman port weather advisory: test replay',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${output}/screenshots/unified-map-mobile.png`});
    pass('Mobile globe, collapsible layer rail and bottom intelligence dock fit without horizontal page overflow');
    assert.equal(errors.length,0,errors.join('\n'));
    pass('Unified map tool path has no uncaught browser errors; no active scan submitted');
  } catch(error) {
    await page.screenshot({path:`${output}/screenshots/failed-tools.png`,timeout:5000}).catch(()=>{});
    error.message+=`\nTool browser errors: ${errors.join('; ')}`;throw error;
  } finally {await context.close();await save({pin:null});}
}
