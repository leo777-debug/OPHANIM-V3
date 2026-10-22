import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';

export async function checkNativeMaps({browser,url,output,pass}) {
  const context=await browser.newContext({viewport:{width:1366,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.fulfill({status:204,body:''}));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const fallback=()=>page.getByText('Natural Earth reference basemap · remote basemap unavailable. Operational data freshness is separate.',{exact:true});
  async function pixels(test=()=>true) {
    const deadline=Date.now()+12000;
    do {
      const canvas=page.locator('canvas.maplibregl-canvas');
      const {data,info}=await sharp(await canvas.screenshot()).raw().toBuffer({resolveWithObject:true});
      const colors=new Set();let green=0,cyan=0;
      for(let i=0;i<data.length;i+=info.channels) {
        const r=data[i],g=data[i+1],b=data[i+2];
        if(i%(info.channels*49)===0)colors.add(`${r},${g},${b}`);
        if(r>100&&g>r+40&&g>b+15)green++;
        if(r<90&&g>150&&b>150)cyan++;
      }
      if(colors.size>8&&test({green,cyan}))return {colors:colors.size,green,cyan};
      await delay(150);
    }while(Date.now()<deadline);
    throw new Error('Native map geography/provider geometry did not render before deadline.');
  }
  try {
    await page.goto(url+'/route-explorer?view=full',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Show reference ports',exact:true}).click();
    await fallback().waitFor();
    await page.getByText(/3,?962 reference points/).waitFor();
    await pixels(({green})=>green>20);
    assert.equal(await page.getByRole('link',{name:'Made with Natural Earth',exact:true}).isVisible(),true);
    await page.screenshot({path:`${output}/screenshots/native-reference-ports.png`});
    pass('Standalone map recovers from blocked remote tiles with attributed reference geography and 3,962 clustered source points');
    for(const [name,query] of [['Origin','Dubai'],['Destination','Rotterdam']]) {
      const group=page.getByRole('group',{name,exact:true});
      await group.getByRole('textbox',{name:'Reference port',exact:true}).fill(query);
      await group.getByRole('button',{name:'Search '+name.toLowerCase(),exact:true}).click();
      await group.getByRole('list').getByRole('button').first().click();
    }
    await page.getByRole('checkbox',{name:'Load public hazard context',exact:true}).uncheck();
    const calculation=page.waitForResponse(response=>response.url()===url+'/api/route-explorer'&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Calculate model',exact:true}).click();
    const response=await calculation;
    assert.equal(response.status(),200);
    const result=await response.json();
    assert.ok(result.baseline.distanceKm>0);
    assert.ok(result.alternative.distanceKm>result.baseline.distanceKm);
    await pixels(({green,cyan})=>green>20&&cyan>20);
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export CSV',exact:true}).click();
    const csv=await download;
    assert.equal(csv.suggestedFilename(),'ophanim-route-scenario.csv');
    await csv.saveAs(`${output}/native-route-scenario.csv`);
    await page.screenshot({path:`${output}/screenshots/native-route-with-ports.png`});
    pass('Real Dubai–Rotterdam route/closure calculation renders beside clustered reference ports and exports CSV without source credentials');
    for(const [path,button] of [['/hazards',null],['/aviation','Show station map']]) {
      await page.goto(url+path+'?view=full',{waitUntil:'domcontentloaded'});
      if(button)await page.getByRole('button',{name:button,exact:true}).click();
      await fallback().waitFor();await pixels();
      await page.screenshot({path:`${output}/screenshots/native-${path.slice(1)}.png`});
    }
    pass('Hazard and Aviation maps also recover to clearly labelled reference basemaps when public providers are unavailable');
    assert.equal(errors.length,0,errors.join('\n'));
    await writeFile(`${output}/native-map-limits.txt`,'Synthetic/local browser validation; remote sources deliberately blocked. 3,962 reference points clustered. No device-independent FPS or upstream availability claim.\n');
  } catch(error) {
    await page.screenshot({path:`${output}/screenshots/failed-native.png`}).catch(()=>{});
    throw error;
  } finally {await context.close();}
}
