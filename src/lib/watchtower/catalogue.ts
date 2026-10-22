import ports from './ports.json';
import catalogue from './catalogue.json';

export interface CameraFeed {
 id: string; name: string; port: string; country: string; lat: number; lon: number;
 type: 'port'|'traffic'|'marina'|'tourist'|'shop'; streamUrl: string|null;
 embedType: 'hls'|'youtube'|'mjpeg'|'iframe'|'snapshot'; sourceUrl: string; terms: string; termsUrl: string;
 lastSeen: string|null; status: 'online'|'offline'|'unverified'; verifiedAt: string|null;
 publicViewingVerified: boolean; embedAllowed: boolean; healthCheckAllowed: boolean; coverage: string;
}
export const priorityPorts = ports;
export const cameraCatalogue = catalogue as CameraFeed[];
export function effectiveCamera(feed:CameraFeed,health?:{status:string;last_seen:string|null},now=Date.now()):CameraFeed{
 const lastSeen=health?.last_seen??feed.lastSeen;
 const status=health?.status==='offline'?'offline':feed.status==='online'&&(!lastSeen||!Number.isFinite(Date.parse(lastSeen))||Date.parse(lastSeen)>now+300000||now-Date.parse(lastSeen)>30*60*1000)?'unverified':feed.status;
 return {...feed,status,lastSeen};
}
export function distanceKm(a: {lat:number;lon:number}, b:{lat:number;lon:number}) {
 const rad=Math.PI/180, dLat=(b.lat-a.lat)*rad, dLon=(b.lon-a.lon)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
 return 6371.0088*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function searchCameraPorts(query: string) {
 const q=query.toLowerCase().trim();
 return priorityPorts.filter(p=>[p.name,p.code,p.country,...p.aliases].some(v=>v.toLowerCase().includes(q))).map(port=>({
  ...port, coverage: 'best_effort' as const,
  cameras:cameraCatalogue.filter(c=>c.port===port.code).map(c=>({...effectiveCamera(c),distanceKm:distanceKm(port,c)})),
  gap:cameraCatalogue.some(c=>c.port===port.code)?'Feed availability does not establish port conditions.':'Unverified coverage: no lawful public feed verified. Never infer all clear.'
 }));
}
export function playable(camera:CameraFeed) {
 if(!camera.publicViewingVerified||!camera.embedAllowed||!camera.streamUrl||effectiveCamera(camera).status!=='online')return false;
 try {const url=new URL(camera.streamUrl);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
// A stale status must remain unknown, but an operator may explicitly open an
// already reviewed public embed to inspect it. This never changes global health.
export function canOpenCamera(camera:CameraFeed){
 if(!camera.publicViewingVerified||!camera.embedAllowed||!camera.streamUrl||camera.status==='offline')return false;
 try{const u=new URL(camera.streamUrl);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
