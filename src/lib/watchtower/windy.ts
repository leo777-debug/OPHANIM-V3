import { distanceKm,type CameraFeed } from './catalogue';
import { isRateLimited } from '@/lib/ssrf-guard';

type Port={code:string;name:string;country:string;lat:number;lon:number};
type Result={cameras:CameraFeed[];warnings:string[]};
const cache=new Map<string,{until:number;result:Result}>();
const termsUrl='https://api4.windy.com/webcams/terms';
export function windyConfigured(){return Boolean(process.env.WINDY_WEBCAMS_API_KEY&&process.env.WINDY_WEBCAMS_TERMS_REVIEWED==='true');}
function permittedUrl(value:unknown){
 if(typeof value!=='string')return null;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['windy.com','www.windy.com','webcams.windy.com','player.windy.com'].includes(u.hostname)?u.href:null;}catch{return null;}
}
// Accept only provider-published players and coordinates. Active means discoverable,
// not verified live video; a day player can be a time lapse.
export function parseWindy(value:unknown,port:Port,now=Date.now()):CameraFeed[]{
 if(!value||typeof value!=='object'||!('webcams' in value)||!Array.isArray(value.webcams))return [];
 return value.webcams.slice(0,50).flatMap((item:unknown)=>{
  if(!item||typeof item!=='object')return [];
  const v=item as Record<string,unknown>,location=v.location as Record<string,unknown>|undefined;
  const player=v.player as Record<string,unknown>|undefined,urls=v.urls as Record<string,unknown>|undefined;
  const id=String(v.webcamId??''),lat=location?.latitude,lon=location?.longitude;
  if(!/^\d{1,20}$/.test(id)||typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||distanceKm(port,{lat,lon})>25)return [];
  const streamUrl=permittedUrl(player?.live)??permittedUrl(player?.day),sourceUrl=permittedUrl(urls?.detail);
  if(!streamUrl||!sourceUrl)return [];
  const time=typeof v.lastUpdatedOn==='string'?Date.parse(v.lastUpdatedOn):NaN;
  return [{id:`windy:${id}`,name:typeof v.title==='string'?v.title.slice(0,200):`Public webcam ${id}`,port:port.code,country:port.country,lat,lon,type:'tourist' as const,
   streamUrl,embedType:'iframe' as const,sourceUrl,termsUrl,terms:'Windy API and camera-publisher terms apply; embed only, no re-streaming. API URLs expire and must be refreshed.',
   lastSeen:Number.isFinite(time)&&time<=now?new Date(time).toISOString():null,status:v.status==='inactive'?'offline' as const:'unverified' as const,
   verifiedAt:null,publicViewingVerified:true,embedAllowed:true,healthCheckAllowed:false,provider:'windy',attribution:'Webcams provided by Windy.com — add a webcam',
   coverage:'Nearby public webcam; field of view and live playback not verified. A day player may be a time lapse, not a live stream.'}];
 });
}
export async function windyCameras(port:Port):Promise<Result>{
 if(!windyConfigured())return {cameras:[],warnings:['Optional Windy discovery is not configured or its terms have not been reviewed.']};
 const saved=cache.get(port.code);if(saved&&saved.until>Date.now())return saved.result;
 if(isRateLimited('watchtower:windy',10))return {cameras:[],warnings:['Windy discovery request limit reached; coverage unknown.']};
 try{
  const url=new URL('https://api.windy.com/webcams/api/v3/webcams');
  url.search=new URLSearchParams({nearby:`${port.lat},${port.lon},25`,include:'location,player,urls',limit:'50'}).toString();
  const response=await fetch(url,{headers:{'x-windy-api-key':process.env.WINDY_WEBCAMS_API_KEY!},redirect:'error',signal:AbortSignal.timeout(8000),cache:'no-store'});
  if(!response.ok)throw new Error('Windy unavailable');
  const body=await response.text();if(body.length>2_000_000)throw new Error('Metadata too large');
  const result={cameras:parseWindy(JSON.parse(body),port),warnings:['Windy discovery does not verify a view of port operations or live playback.']};
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  cache.set(port.code,{until:Date.now()+5*60000,result});return result;
 }catch{return {cameras:[],warnings:['Windy unavailable; coverage unknown. No credentials or circumvention attempted.']};}
}
