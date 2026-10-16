import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { atlasFallbackBasemap as presentationBasemap } from '../../src/lib/presentation/basemap.ts';

const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1920,height:972},deviceScaleFactor:1});
  await page.setContent('<style>html,body{margin:0;background:#080e14}#map{position:absolute;inset:0}</style><div id="map"></div>');
  await page.addStyleTag({path:'node_modules/maplibre-gl/dist/maplibre-gl.css'});
  await page.addScriptTag({path:'node_modules/maplibre-gl/dist/maplibre-gl.js'});
  const style=structuredClone(presentationBasemap);
  style.sources.countries.data=JSON.parse(await readFile('public/presentation/countries.geojson','utf8'));
  await page.evaluate(async style=>{
    const map=new window.maplibregl.Map({container:'map',style,center:[42,24],zoom:1.8,attributionControl:false,interactive:false});
    await new Promise((resolve,reject)=>{map.on('error',event=>reject(new Error(event.error?.message)));map.on('load',()=>{map.setProjection({type:'globe'});map.setPitch(20);map.once('idle',resolve);});});
  },style);
  await page.locator('canvas').screenshot({path:'public/presentation/globe-poster.png'});
  console.log('Saved geography-only starter globe. No live data, markers or customer records are included.');
}finally{await browser.close();}
