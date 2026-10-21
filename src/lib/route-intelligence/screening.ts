import { findWarSanctionsVessels } from '@/lib/war-sanctions';
import { matchExact } from '@/lib/sanctions';
import type { LensEvidence } from './lens';
// Public screening sources, never AIS tracking. Reuse both existing adapters.
export async function screenRouteVessel(imo?:string,name?:string):Promise<{evidence:LensEvidence[];gap?:string}>{
 if(process.env.ROUTE_SCREENING_TERMS_REVIEWED!=='true')return {evidence:[],gap:'GUR/OpenSanctions screening disabled pending source terms and commercial-use review.'};
 if(!imo&&!name)return {evidence:[],gap:'No vessel IMO/name available for public sanctions screening.'};
 const results=await Promise.allSettled([findWarSanctionsVessels(imo??name!,AbortSignal.timeout(10000)),name?matchExact(name):Promise.resolve([])]);
 const evidence:LensEvidence[]=[];
 if(results[0].status==='fulfilled')for(const vessel of results[0].value){
  if(!imo||vessel.imo!==imo)continue; // Weak vessel-name matches are not an identity confirmation.
  evidence.push({id:`gur:${vessel.catalogue}:${vessel.id}`,layer:'screening',title:`GUR screening: ${vessel.name}`,why:`Exact IMO ${imo} appears in GUR's public ${vessel.catalogue} catalogue. A public-source screening flag, not confirmation; no current vessel position is supplied.`,sourceUrl:vessel.sourceUrl,confidence:'single public source / requires review',metadata:{imo,provider:'war-sanctions',checkedAt:new Date().toISOString()}});
 }
 if(results[1].status==='fulfilled')for(const entry of results[1].value.filter(e=>e.schema==='Vessel'))evidence.push({id:`opensanctions:${entry.id}`,layer:'screening',title:`OpenSanctions screening: ${entry.name}`,why:'Exact normalized vessel-name match in existing OFAC/OpenSanctions provider; name alone does not establish identity. Cross-check IMO and current official list before action.',sourceUrl:`https://www.opensanctions.org/entities/${encodeURIComponent(entry.id)}/`,confidence:'name match / requires review',metadata:{provider:'sanctions-entity',programs:entry.programs,checkedAt:new Date().toISOString()}});
 return {evidence,gap:results.some(r=>r.status==='rejected')?'At least one public screening source unavailable. No clearance inference.':evidence.length?undefined:'No matches in loaded public catalogues; this is not sanctions clearance.'};
}
