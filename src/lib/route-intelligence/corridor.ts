import { distanceKm } from '@/lib/watchtower/catalogue';
export type Point=[number,number];
const R=6371.0088,rad=Math.PI/180;
const distance=(a:Point,b:Point)=>distanceKm({lat:a[1],lon:a[0]},{lat:b[1],lon:b[0]});
function bearing(a:Point,b:Point){const d=(b[0]-a[0])*rad;return Math.atan2(Math.sin(d)*Math.cos(b[1]*rad),Math.cos(a[1]*rad)*Math.sin(b[1]*rad)-Math.sin(a[1]*rad)*Math.cos(b[1]*rad)*Math.cos(d));}
export function corridorDistance(point:Point,line:Point[]){
 let best=Infinity;
 for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],ab=distance(a,b),ap=distance(a,point);
  if(ab<.001){best=Math.min(best,ap);continue;}
  const angle=bearing(a,point)-bearing(a,b),cross=Math.asin(Math.max(-1,Math.min(1,Math.sin(ap/R)*Math.sin(angle))))*R;
  const along=Math.atan2(Math.sin(ap/R)*Math.cos(angle),Math.cos(ap/R))*R;
  best=Math.min(best,along>=0&&along<=ab?Math.abs(cross):Math.min(ap,distance(b,point)));
 }return best;
}
// Render a sampled geodesic buffer. Geodesic distance above is the authoritative filter.
export function corridorPolygons(line:Point[],radiusKm=50){
 const polygons:Point[][][]=[];
 for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],steps=Math.max(1,Math.ceil(distance(a,b)/radiusKm));
  const delta=((b[0]-a[0]+540)%360)-180;
  for(let j=0;j<=steps;j++){
   const t=j/steps,lat=a[1]+(b[1]-a[1])*t,lon=a[0]+delta*t;
   if(Math.abs(lon)>179||Math.abs(lat)>84)continue;
   const ring:Point[]=[];
   for(let k=0;k<=16;k++){const angle=k/16*2*Math.PI;ring.push([lon+Math.cos(angle)*radiusKm/(111.32*Math.cos(lat*rad)),lat+Math.sin(angle)*radiusKm/111.32]);}
   polygons.push([ring]);
  }
 }return polygons;
}
