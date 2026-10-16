import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FeedId } from './types';

async function payload(response:Response) {
  if (!response.ok) throw new Error('Public feed unavailable.');
  const text=await response.text();
  if (Buffer.byteLength(text)>24*1024*1024) throw new Error('Public feed exceeds response limit.');
  return JSON.parse(text);
}
let maritime: { until:number; promise:Promise<unknown> } | undefined;
function marinePayload() {
  if (maritime && maritime.until>Date.now()) return maritime.promise;
  const promise=import('@/app/api/maritime/route').then(route=>route.GET()).then(payload);
  maritime={until:Date.now()+60000,promise};
  void promise.catch(()=>{if(maritime?.promise===promise)maritime=undefined;});
  return promise;
}

// A fixed list of existing public feed handlers. No tenant, provider search,
// SDK, account, AI, embed, arbitrary URL or request-cookie forwarding.
export async function loadPublicPayload(id:FeedId):Promise<unknown> {
  let response:Response;
  switch(id) {
    case 'flights': response=await (await import('@/app/api/flights/route')).GET();break;
    case 'maritime': case 'ports': case 'chokepoints': return marinePayload();
    case 'cameras': {
      await import('@/app/api/cctv/route');
      const {publicCameraSnapshot}=await import('@/app/api/cctv/region-cache');
      for(let attempt=0;attempt<36;attempt++) {
        const snapshot=publicCameraSnapshot();
        if(snapshot.cameras.length) return snapshot;
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      throw new Error('Public camera directories are still warming.');
    }
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
