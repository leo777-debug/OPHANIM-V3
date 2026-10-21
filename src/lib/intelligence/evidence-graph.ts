import {extractEntities,GAZETTEER,trustFor,type GazetteerEntry,type SourceTrust} from './analysis';
import type {NewsItem} from './news';
import type {NormalizedIntelligenceEvent} from './event-provider';

export interface EvidenceRecord {
 id:string;provider:string;source:string;kind:string;title:string;text:string;url:string;
 publishedAt:string|null;organizationScope:string|null;mode:'fresh'|'stale'|'unknown'|'replay';
}
export type EvidenceGraph = ReturnType<typeof buildEvidenceGraph>;
const date=(value:unknown)=>{
 if(typeof value==='string'){const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(value);if(match){const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),leap=year%4===0&&(year%100!==0||year%400===0);const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];if(month<1||month>12||day<1||day>days[month-1])return null;}return Number.isFinite(Date.parse(value))?value:null;}
 return typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(new Date(value).getTime())?new Date(value).toISOString():null;
};
export function evidenceSourceUrl(value:string):string{try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||[...url.searchParams.keys()].some(key=>/(?:^|[_-])(key|token|secret|password|signature|credential|authorization|auth)(?:$|[_-])/i.test(key)))return '';return url.href;}catch{return '';}}
export function newsEvidence(news:readonly NewsItem[]):EvidenceRecord[]{return news.map(item=>({id:item.id,provider:`news:${item.source}`,source:item.source,kind:'news',title:item.title,text:item.description,url:evidenceSourceUrl(item.link),publishedAt:date(item.published),organizationScope:null,mode:item.source_data_mode==='fresh'?'fresh':item.source_data_mode==='stale'?'stale':'unknown'}));}
/** The caller supplies the authorized scope; records from every other scope are excluded. */
export function normalizedEvidence(events:readonly NormalizedIntelligenceEvent[],organizationScope:string|null=null):EvidenceRecord[]{
 return events.filter(event=>event.organizationScope===organizationScope).map(event=>({id:event.externalId,provider:event.providerId,source:event.providerId,kind:event.eventType,title:event.title,
 text:[event.summary,...event.entities.filter(entity=>entity.type!=='other').map(entity=>entity.type==='port'?`port ${entity.value}`:entity.type==='imo'?`IMO ${entity.value}`:entity.type==='mmsi'?`MMSI ${entity.value}`:entity.label??entity.value)].join(' '),
 url:evidenceSourceUrl(event.sources.find(source=>source.url)?.url??''),publishedAt:date(event.startedAt??event.sources.find(source=>source.publishedAt)?.publishedAt),organizationScope:event.organizationScope,
 mode:event.attributes.dataMode==='fresh'?'fresh':event.attributes.dataMode==='stale'?'stale':'unknown'}));
}
export function quakeEvidence(quakes:readonly {id:string;place:string;time:number;url:string}[]):EvidenceRecord[]{return quakes.map(quake=>({id:quake.id,provider:'usgs-earthquakes',source:'USGS',kind:'seismic',title:quake.place,text:quake.place,url:evidenceSourceUrl(quake.url),publishedAt:date(quake.time),organizationScope:null,mode:'unknown'}));}
export function fireEvidence(fires:readonly {lat:number;lng:number;observedAt?:string|null;date?:string;time?:string;title?:string;type?:string}[]):EvidenceRecord[]{return fires.filter(fire=>fire.type!=='volcano').map(fire=>{
 const clock=fire.time?.padStart(4,'0'),observed=fire.observedAt||(fire.date&&clock&&/^\d{4}-\d{2}-\d{2}$/.test(fire.date)&&/^\d{4}$/.test(clock)?`${fire.date}T${clock.slice(0,2)}:${clock.slice(2)}:00Z`:null);
 return {id:`${fire.lat}:${fire.lng}:${observed??'undated'}`,provider:'nasa-firms',source:'NASA',kind:'fire',title:fire.title||'Satellite hotspot observation',text:fire.title||'',url:'https://firms.modaps.eosdis.nasa.gov/',publishedAt:date(observed),organizationScope:null,mode:'unknown'};
});}

/** Bipartite evidence→mention graph. Shared names are lexical links, never identity or causation proof. */
export function buildEvidenceGraph(input:readonly EvidenceRecord[],options:{dictionary?:readonly GazetteerEntry[];organizationScope?:string|null;now?:number;maxRecords?:number;replay?:boolean}={}){
 const scope=options.organizationScope??null,now=options.now??Date.now();
 const max=options.maxRecords??1000;if(!Number.isInteger(max)||max<1||max>2000)throw new Error('Graph record bound must be 1–2000.');
 const records:Array<EvidenceRecord&{key:string;trust:SourceTrust;temporal:'dated'|'unknown'|'future'}>=[];
 const entities=new Map<string,{id:string;label:string;type:string;recordKeys:string[];kinds:Set<string>}>();
 const edges:Array<{source:string;target:string;relation:'mentions'}>=[];
 const seen=new Set<string>();let truncated=0;
 for(const record of input){
  if(!record||record.organizationScope!==scope)continue;
  if(typeof record.id!=='string'||!record.id||record.id.length>300||typeof record.provider!=='string'||!record.provider||record.provider.length>200||typeof record.source!=='string'||typeof record.kind!=='string'||typeof record.title!=='string'||typeof record.text!=='string'||typeof record.url!=='string')continue;
  const key=`record:${JSON.stringify([record.provider,record.id])}`;if(seen.has(key))continue;seen.add(key);
  if(records.length>=max){truncated++;continue;}
  const publishedAt=date(record.publishedAt),temporal:'dated'|'unknown'|'future'=publishedAt?(Date.parse(publishedAt)>now?'future':'dated'):'unknown';
  const row:typeof records[number]={id:record.id,provider:record.provider,source:record.source.slice(0,200),kind:record.kind.slice(0,80),organizationScope:scope,
    mode:options.replay?'replay':['fresh','stale','replay'].includes(record.mode)?record.mode:'unknown',key,title:record.title.slice(0,1000),text:record.text.slice(0,10000),url:evidenceSourceUrl(record.url),publishedAt,temporal,trust:trustFor(record.source)};
  records.push(row);
  for(const entity of extractEntities(`${row.title} ${row.text}`,options.dictionary??GAZETTEER).slice(0,30)){
   const node=entities.get(entity.id)??{id:entity.id,label:entity.label,type:entity.type,recordKeys:[],kinds:new Set<string>()};
   node.recordKeys.push(key);node.kinds.add(row.kind);entities.set(entity.id,node);edges.push({source:key,target:entity.id,relation:'mentions'});
  }
 }
 const coverage=new Map<string,{provider:string;source:string;count:number;dated:number;unknownDates:number;futureDates:number;stale:number;unknownFreshness:number;replay:number;unmatched:number}>();
 const linked=new Set(edges.map(edge=>edge.source));
 for(const record of records){const row=coverage.get(record.provider)??{provider:record.provider,source:record.source,count:0,dated:0,unknownDates:0,futureDates:0,stale:0,unknownFreshness:0,replay:0,unmatched:0};row.count++;row.dated+=Number(record.temporal==='dated');row.unknownDates+=Number(record.temporal==='unknown');row.futureDates+=Number(record.temporal==='future');row.stale+=Number(record.mode==='stale');row.unknownFreshness+=Number(record.mode==='unknown');row.replay+=Number(record.mode==='replay');row.unmatched+=Number(!linked.has(record.key));coverage.set(record.provider,row);}
 return {records,entities:[...entities.values()].map(entity=>({...entity,kinds:[...entity.kinds].sort()})).sort((a,b)=>b.recordKeys.length-a.recordKeys.length||a.id.localeCompare(b.id)),edges,coverage:[...coverage.values()].sort((a,b)=>a.provider.localeCompare(b.provider)),truncated,
  method:'Shared explicit dictionary mentions/identifiers across loaded evidence; no inferred event location, identity confirmation, common cause or automated alert.'};
}
