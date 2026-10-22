import type { Point } from './open-network';
import { distanceKm } from '@/lib/watchtower/catalogue';

export interface RoadEndpoint { label: string; lat: number; lon: number; }
export interface TruckDimensions { height: number; width: number; length: number; weight: number; hazmat: boolean; }
export interface RoadLeg {
 side: 'origin'|'destination'; from: RoadEndpoint; to: RoadEndpoint;
 coordinates: Point[]; distanceKm: number; durationHours: number;
 truck: TruckDimensions; checkedAt: string; provider: 'valhalla';
 attribution: string; caveat: string;
}
export function parseRoadInput(input: unknown): {side:RoadLeg['side'];from:RoadEndpoint;to:RoadEndpoint;truck:TruckDimensions} {
 if(!input||typeof input!=='object')throw new Error('Road leg must be an object.');
 const r=input as Record<string,unknown>;
 if(r.side!=='origin'&&r.side!=='destination')throw new Error('Road leg side required.');
 const endpoint=(value:unknown):RoadEndpoint=>{
  if(!value||typeof value!=='object')throw new Error('Select a depot and a public port gate.');
  const p=value as Record<string,unknown>;
  if(typeof p.label!=='string'||!p.label.trim()||p.label.length>500||typeof p.lat!=='number'||typeof p.lon!=='number'||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180)throw new Error('Invalid road endpoint.');
  return {label:p.label.trim(),lat:p.lat,lon:p.lon};
 };
 const from=endpoint(r.from),to=endpoint(r.to);
 if(distanceKm(from,to)<.05)throw new Error('Select distinct road endpoints.');
 const t=r.truck as Record<string,unknown>|undefined;
 if(typeof t?.hazmat!=='boolean')throw new Error('Declare whether the cargo is hazardous.');
 const bounds={height:[1,6],width:[1,4],length:[2,30],weight:[.1,100]};
 for(const [key,[min,max]] of Object.entries(bounds))if(!t||typeof t[key]!=='number'||!Number.isFinite(t[key])||(t[key] as number)<min||(t[key] as number)>max)throw new Error('Explicit truck dimensions required: metres and metric tonnes.');
 return {side:r.side,from,to,truck:{height:t!.height as number,width:t!.width as number,length:t!.length as number,weight:t!.weight as number,hazmat:t!.hazmat as boolean}};
}
export async function routeRoadLeg(input: ReturnType<typeof parseRoadInput>, fetcher:typeof fetch=fetch):Promise<RoadLeg> {
 const base=process.env.ROAD_ROUTER_URL;
 if(!base)throw new Error('Road router is not configured. Set ROAD_ROUTER_URL to your reviewed Valhalla service.');
 const url=new URL(base);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid road router configuration.');
 // Operator-controlled internal endpoint only. Neither endpoint nor path comes from a request.
 const response=await fetcher(new URL('/route',url),{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json'},body:JSON.stringify({
  locations:[input.from,input.to].map(p=>({lat:p.lat,lon:p.lon,type:'break',radius:1000})),costing:'truck',
  costing_options:{truck:{...input.truck}},format:'osrm',shape_format:'geojson',alternates:0,
 })});
 if(!response.ok)throw new Error(`Road routing unavailable (${response.status}).`);
 const text=await response.text();if(text.length>4_000_000)throw new Error('Road response too large.');
 const body=JSON.parse(text);const route=body.routes?.[0];const coordinates=route?.geometry?.coordinates;
 if(body.code!=='Ok'||route?.geometry?.type!=='LineString'||!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>50000||!coordinates.every((p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)||!Number.isFinite(route.distance)||route.distance<=0||!Number.isFinite(route.duration)||route.duration<0)throw new Error('No valid truck road route returned.');
 const start=coordinates[0],end=coordinates.at(-1);
 if(distanceKm(input.from,{lon:start[0],lat:start[1]})>1||distanceKm(input.to,{lon:end[0],lat:end[1]})>1)throw new Error('Road snapping exceeds 1 km. Select an accessible public port gate instead of a berth centroid.');
 return {...input,coordinates,distanceKm:route.distance/1000,durationHours:route.duration/3600,provider:'valhalla',checkedAt:new Date().toISOString(),
  attribution:'© OpenStreetMap contributors (ODbL); Valhalla routing. https://www.openstreetmap.org/copyright',
  caveat:'Indicative truck route using declared dimensions and loaded map restrictions. No live traffic, customs, permit, hazardous-cargo or gate-access clearance. Confirm with carrier.'};
}
