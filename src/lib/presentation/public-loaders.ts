import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FeedId } from './types';
import { NextRequest } from 'next/server';

async function payload(response:Response) {
  if (!response.ok) throw new Error('Public feed unavailable.');
  const text=await response.text();
  if (Buffer.byteLength(text)>24*1024*1024) throw new Error('Public feed exceeds response limit.');
  return JSON.parse(text);
}
let maritime: { until:number; promise:Promise<unknown> } | undefined;
function marinePayload() {
  if (maritime && maritime.until>Date.now()) return maritime.promise;
  const promise=import('@/app/api/maritime/route')
    .then(route=>route.GET(new NextRequest('http://ophanim.internal/api/maritime?public=1'))).then(payload);
  maritime={until:Date.now()+60000,promise};
  void promise.catch(()=>{if(maritime?.promise===promise)maritime=undefined;});
  return promise;
}
// Serverless instances start with an empty region cache, so returning the first warm
// region showed only a handful of cameras. Aggregate every region (about 10 s), and
// past the deadline fall back to the regions that have completed so far.
const CAMERA_DEADLINE_MS=22000;
let cameras: { until:number; promise:Promise<unknown> } | undefined;
function cameraPayload() {
  if (cameras && cameras.until>Date.now()) return cameras.promise;
  const entry={until:Date.now()+5*60000,promise:Promise.resolve() as Promise<unknown>};
  entry.promise=(async()=>{
    const route=await import('@/app/api/cctv/route');
    const {publicCameraSnapshot}=await import('@/app/api/cctv/region-cache');
    const full=route.GET(new Request('http://ophanim.internal/api/cctv?region=all')).then(payload).then(value=>({value,complete:true}));
    const partial=new Promise<{value:unknown;complete:boolean}>(resolve=>setTimeout(()=>resolve({value:publicCameraSnapshot(),complete:false}),CAMERA_DEADLINE_MS));
    const {value,complete}=await Promise.race([full,partial]);
    if (!(value as {cameras?:unknown[]}).cameras?.length) throw new Error('Public camera directories are still warming.');
    if (!complete) entry.until=Date.now()+60000; // Retry the full set sooner.
    return value;
  })();
  cameras=entry;
  void entry.promise.catch(()=>{if(cameras===entry)cameras=undefined;});
  return entry.promise;
}

// A fixed list of existing public feed handlers. No tenant, provider search,
// SDK, account, AI, embed, arbitrary URL or request-cookie forwarding.
export async function loadPublicPayload(id:FeedId):Promise<unknown> {
  let response:Response;
  switch(id) {
    case 'flights': response=await (await import('@/app/api/flights/route')).GET();break;
    case 'maritime': case 'ports': case 'chokepoints': return marinePayload();
    case 'cameras': return cameraPayload();
    case 'broadcasts': response=await (await import('@/app/api/live-news/route')).GET();break;
    case 'conflicts': response=await (await import('@/app/api/conflicts/route')).GET();break;
    case 'infrastructure': response=await (await import('@/app/api/infrastructure/route')).GET();break;
    case 'war-sanctions': {
      const {warSanctionsProvider}=await import('@/lib/providers/providers/war-sanctions-provider');
      const layers=await warSanctionsProvider.createMapLayers!({requestedProviders:['war-sanctions'],signal:AbortSignal.timeout(20000)});
      return {points:layers.flatMap(layer=>layer.source.features.map(feature=>{
        const p=feature.properties??{},coordinates=feature.geometry.coordinates;
        if(!Array.isArray(coordinates))return {};
        return {name:`${p.vessel} / ${p.port}`,lat:coordinates[1],lng:coordinates[0],...p};
      }))};
    }
    case 'earthquakes': response=await (await import('@/app/api/earthquakes/route')).GET();break;
    case 'fires': response=await (await import('@/app/api/fires/route')).GET();break;
    case 'weather': response=await (await import('@/app/api/weather/route')).GET();break;
    case 'satellites': response=await (await import('@/app/api/satellites/route')).GET();break;
    case 'incidents': response=await (await import('@/app/api/gdelt/route')).GET();break;
    case 'cyber': response=await (await import('@/app/api/malware/route')).GET();break;
    case 'news': response=await (await import('@/app/api/news/route')).GET();break;
    case 'space-weather': response=await (await import('@/app/api/space-weather/route')).GET();break;
    case 'cables': return JSON.parse(await readFile(resolve(process.cwd(),'public/data/submarine-cables.json'),'utf8'));
  }
  return payload(response);
}
