import { screenRouteVessel } from './screening';
import { db } from '@/lib/watchlists/db';
import { getShipment } from '@/lib/logistics/shipments';
import type { OrganizationActor } from '@/lib/operations/types';
import type { ProviderMapLayer } from '@/lib/providers/types';
import { priorityPorts,searchCameraPorts } from '@/lib/watchtower/catalogue';
import { shipmentMentions } from '@/lib/dark-web/corridor';
import { exploreSeaRoute,findReferencePorts,type Point } from './open-network';
import { corridorDistance,corridorPolygons } from './corridor';
import type { RoadLeg } from './road';

import { LENS_LAYERS } from './lens-types';
export { LENS_LAYERS } from './lens-types';
export type LensLayer=typeof LENS_LAYERS[number];
export interface LensEvidence {id:string;layer:LensLayer;title:string;why:string;sourceUrl?:string;lat?:number;lon?:number;observedAt?:string;confidence:string;metadata?:Record<string,unknown>;}
export interface RouteLens {
 shipmentId:string;label:string;ports:Array<{name:string;code:string;lat:number;lon:number}>;
 layers:ProviderMapLayer[];evidence:LensEvidence[];gaps:string[];counts:Record<LensLayer,number>;
 silenceClock:{hours:number;source:string;typicalHours:number|null};corridorKm:number;updatedAt:string;assumptions:string[];
 roadLegs:RoadLeg[];
}
async function resolvePort(value:string){
 const p=priorityPorts.find(p=>[p.code,p.name,...p.aliases].some(v=>v.toLowerCase()===value.toLowerCase()));
 if(p)return {name:p.name,code:p.code,lat:p.lat,lon:p.lon};
 const exact=(await findReferencePorts(value)).filter(p=>p.code.toLowerCase()===value.toLowerCase()||p.name.toLowerCase()===value.toLowerCase());
 if(exact.length!==1)return null;
 return {name:exact[0].name,code:exact[0].code,lat:exact[0].coordinates[1],lon:exact[0].coordinates[0]};
}
const lineLayer=(id:string,coordinates:Point[],color:string,opacity=1):ProviderMapLayer=>({id,provider:'route-lens',name:id,geometry:'line',visible:true,interactive:true,style:{color,width:3,opacity},source:{type:'FeatureCollection',features:coordinates.length>1?[{type:'Feature',geometry:{type:'LineString',coordinates},properties:{label:id,why:'Indicative sea network; not vessel telemetry or navigation'}}]:[]}});
export async function buildRouteLens(actor:OrganizationActor,shipmentId:string):Promise<RouteLens|null>{
 const shipment=await getShipment(actor,shipmentId);if(!shipment)return null;
 const gaps:string[]=[],layers:ProviderMapLayer[]=[],evidence:LensEvidence[]=[],assumptions:string[]=[];
 const lastFact=await db().query('select occurred_at,source from ophanim_shipment_events where organization_id=$1 and shipment_id=$2 and occurred_at<=now() order by occurred_at desc limit 1',[actor.organizationId,shipmentId]);
 const latest=lastFact.rows[0];const silenceClock={hours:Math.max(0,(Date.now()-Date.parse(String(latest?.occurred_at??shipment.createdAt)))/3600000),source:latest?.source??'shipment booking; no later fact recorded',typicalHours:null};
 const values=[shipment.originPortCode??shipment.originPortName,...(shipment.transshipmentPorts??[]),shipment.destinationPortCode??shipment.destinationPortName];
 const ports:RouteLens['ports']=[];let resolved=true;
 for(const value of values){const port=value?await resolvePort(value):null;if(port)ports.push(port);else{gaps.push(`Unresolved route stop: ${value??'not supplied'}. Select an unambiguous port or record a route.`);resolved=false;}}
 const stored=await db().query(`select route_geometry from ophanim_routes where organization_id=$1 and shipment_id=$2 and route_status='ready' and archived_at is null order by updated_at desc limit 1`,[actor.organizationId,shipmentId]);
 const geometry=stored.rows[0]?.route_geometry as {type?:string;coordinates?:Point[]}|undefined;
 let corridor:Point[]=[];
 if(geometry?.type==='LineString'&&Array.isArray(geometry.coordinates)&&geometry.coordinates.length>1&&geometry.coordinates.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)){
  corridor=geometry.coordinates;layers.push(lineLayer('route-lens-primary',corridor,'#38dfc4'));assumptions.push('Recorded route geometry. Confirm provenance and vessel suitability with the carrier.');
 }else if(resolved){
  for(let i=1;i<ports.length;i++){
   const a=ports[i-1],b=ports[i];const route=await exploreSeaRoute([a.lon,a.lat],[b.lon,b.lat],{closed:['suez']});
   if(!route.baseline){gaps.push(`No sea network path for ${a.name} → ${b.name}.`);continue;}
   const coordinates=route.baseline.coordinates;corridor.push(...coordinates);
   layers.push(lineLayer(`route-lens-sea-${i}`,coordinates,'#38dfc4'));
   if(route.alternative&&JSON.stringify(route.alternative.coordinates)!==JSON.stringify(coordinates))layers.push(lineLayer(`route-lens-alternative-${i}`,route.alternative.coordinates,'#7b8593',.35));
   for(const [j,connector] of route.baseline.connectors.entries())layers.push(lineLayer(`route-lens-unrouted-${i}-${j}`,[connector.from,connector.to],'#e5b865',.5));
   assumptions.push(...route.baseline.assumptions);
  }
 }
 const roadRecord=await db().query(`select metadata->'road_legs' as legs from ophanim_routes where organization_id=$1 and shipment_id=$2 and archived_at is null and metadata ? 'road_legs' order by updated_at desc limit 1`,[actor.organizationId,shipmentId]);
 const roadLegs=Object.values(roadRecord.rows[0]?.legs??{}).filter((r):r is RoadLeg=>{
  const leg=r as RoadLeg;return leg?.provider==='valhalla'&&Array.isArray(leg.coordinates)&&leg.coordinates.length>1&&leg.coordinates.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
 });
 const corridors= [...(corridor.length>1?[corridor]:[]),...roadLegs.map(r=>r.coordinates)];
 for(const leg of roadLegs){
  const layer=lineLayer(`route-lens-road-${leg.side}`,leg.coordinates,'#a2c4ff');
  for(const f of layer.source.features)f.properties={...f.properties,why:leg.caveat,label:`${leg.from.label} → ${leg.to.label}`,attribution:leg.attribution};
  layers.push(layer);assumptions.push(leg.caveat,leg.attribution);
  if(Date.now()-Date.parse(leg.checkedAt)>7*86400000)gaps.push(`${leg.side} road route is older than seven days; recalculate before use.`);
 }
 if(corridors.length)layers.unshift({id:'route-lens-buffer',provider:'route-lens',name:'50 km evidence corridor',geometry:'polygon',visible:true,interactive:false,style:{color:'#38dfc4',opacity:.08},source:{type:'FeatureCollection',features:corridors.map(points=>({type:'Feature',geometry:{type:'MultiPolygon',coordinates:corridorPolygons(points)},properties:{}}))}});
 for(const side of ['origin','destination'])if(!roadLegs.some(r=>r.side===side))gaps.push(`${side} road leg unknown. Select a depot and accessible public port gate to calculate a truck route. Amber sea-network connectors remain unrouted.`);
 for(const port of ports){
  const catalog=searchCameraPorts(port.code)[0];if(!catalog)continue;
  if(!catalog.cameras.length)gaps.push(`${port.name}: public camera coverage unverified.`);
  for(const cam of catalog.cameras)evidence.push({id:`camera:${cam.id}`,layer:'cameras',title:cam.name,why:`${cam.distanceKm.toFixed(1)} km from ${port.name}; nearby waterfront association, not berth observation. ${cam.coverage}`,sourceUrl:cam.sourceUrl,lat:cam.lat,lon:cam.lon,confidence:cam.status,metadata:{port:port.code,lastSeen:cam.lastSeen,terms:cam.terms}});
 }
 for(const mention of await shipmentMentions(actor,shipmentId))evidence.push({id:`mention:${mention.id}:${mention.match_method}`,layer:'deep_watch',title:String(mention.title??'Unverified threat metadata'),why:`Matched route entity via ${mention.match_method}; ${mention.requires_review?'manual review required':'identity match still needs verification'}. Association has no reported physical location.`,sourceUrl:mention.source_reference??undefined,observedAt:String(mention.first_seen_at),confidence:`${mention.confidence_level??'unassessed'} / source reliability ${mention.source_reliability}`,metadata:{...mention,reviewUrl:'/operations'}});
 // Reuse normalized evidence rather than fetching a second news/weather pipeline.
 const events=await db().query(`select e.id,e.title,e.category,e.event_type,e.latitude,e.longitude,e.occurred_at,e.confidence,o.source_url
  from ophanim_events e left join lateral(select source_url from ophanim_observations where event_id=e.id and (organization_id=$1 or organization_id is null) order by retrieved_at desc limit 1)o on true
  where (e.organization_id=$1 or (e.organization_id is null and e.visibility='global'))
  and e.first_seen_at>now()-interval '7 days' and e.occurred_at<=now() and e.event_status not in ('resolved','cancelled') order by e.first_seen_at desc limit 1000`,[actor.organizationId]);
 for(const e of events.rows){
  if(e.latitude===null||e.longitude===null||!corridors.some(points=>corridorDistance([e.longitude,e.latitude],points)<=50))continue;
  const kind=`${e.category} ${e.event_type}`.toLowerCase();const layer:LensLayer=/weather|storm|flood|wave/.test(kind)?'weather':/market|fuel|bunker|rate|demurrage/.test(kind)?'market':/sanction|shadow/.test(kind)?'screening':'news';
  evidence.push({id:`event:${e.id}`,layer,title:e.title,why:'Normalized reported event within 50 km of the planned corridor; proximity does not establish impact.',sourceUrl:e.source_url??undefined,lat:e.latitude,lon:e.longitude,observedAt:e.occurred_at?String(e.occurred_at):undefined,confidence:e.confidence===null?'unverified':`${e.confidence}/100 source confidence`});
 }
 const screening=await screenRouteVessel(shipment.imoNumber,shipment.vesselName);
 evidence.push(...screening.evidence);if(screening.gap)gaps.push(screening.gap);
 for(const layer of LENS_LAYERS){
  const items=evidence.filter(e=>e.layer===layer);
  if(!items.length&&layer!=='cameras')gaps.push(`${layer.replaceAll('_',' ')}: no matching normalized evidence loaded; conditions unknown.`);
  layers.push({id:`route-lens-${layer}`,provider:'route-lens',name:layer,geometry:'point',visible:true,interactive:true,style:{color:layer==='deep_watch'?'#ec8cbd':layer==='screening'?'#ff826e':'#f8bc59',radius:7},source:{type:'FeatureCollection',features:items.flatMap(e=>{
   // Unlocated mentions are associated with a reference port, never presented as a sighting.
   const p=ports[0];if(e.lat===undefined&&!p)return [];
   return [{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[e.lon??p.lon,e.lat??p.lat]},properties:{...e,provider:'route-lens',associationOnly:e.lat===undefined}}];
  })}});
 }
 return {roadLegs,silenceClock,shipmentId,label:shipment.shipmentReference,ports,layers,evidence,gaps,counts:Object.fromEntries(LENS_LAYERS.map(l=>[l,evidence.filter(e=>e.layer===l).length])) as Record<LensLayer,number>,corridorKm:50,updatedAt:new Date().toISOString(),assumptions:[...new Set(assumptions)]};
}
