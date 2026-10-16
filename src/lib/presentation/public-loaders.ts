import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FeedId } from './types';

// A fixed list of existing public feed handlers. No tenant, provider search,
// SDK, account, AI, embed, arbitrary URL or request-cookie forwarding.
export async function loadPublicPayload(id:FeedId):Promise<unknown> {
  let response:Response;
  switch(id) {
    case 'flights': response=await (await import('@/app/api/flights/route')).GET();break;
    case 'maritime': response=await (await import('@/app/api/maritime/route')).GET();break;
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
  if (!response.ok) throw new Error('Public feed unavailable.');
  const text=await response.text();
  if (Buffer.byteLength(text)>12*1024*1024) throw new Error('Public feed exceeds response limit.');
  return JSON.parse(text);
}
