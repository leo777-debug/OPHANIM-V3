import { distanceKm,searchCameraPorts } from './catalogue';
import { windyCameras } from './windy';
export async function cameraPortsWithSources(query:string){
 const ports=searchCameraPorts(query),warnings:string[]=[];
 // Resolve one port before using a quota-bearing provider; no background sweeps.
 if(ports.length===1){const result=await windyCameras(ports[0]);warnings.push(...result.warnings);ports[0].cameras.push(...result.cameras.map(c=>({...c,distanceKm:distanceKm(ports[0],c)})));}
 return {ports,warnings};
}
export const cameraPolicy='Public publisher embeds only; no private CCTV, scanning, credential bypass or re-streaming. Missing/stale coverage never means all clear.';
export function legacyCameraResult(port:ReturnType<typeof searchCameraPorts>[number],warnings:string[],includeDead:boolean){
 return {port,feeds:port.cameras.filter(c=>includeDead||c.status!=='offline').map(c=>({...c,status:c.status==='online'?'live':c.status==='offline'?'dead':'unverified'})),live:port.cameras.filter(c=>c.status==='online').length,warnings:[port.gap,...warnings],policy:cameraPolicy};
}
