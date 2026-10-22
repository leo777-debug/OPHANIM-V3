import { safeFetch,isRateLimited } from '@/lib/ssrf-guard';
import { boundedJson } from '@/lib/http/body';
import { safeMetadata } from './scope';
import { DARK_WEB_ENTITY_TYPES,DARK_WEB_SOURCE_CATEGORIES,type DarkWebProvider,type DarkWebRawMention,type DarkWebSourceCategory } from './types';

const clean=(v:unknown,n=2000)=>typeof v==='string'?v.replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n):'';
const fold=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
const sourceUrl=(v:unknown)=>{try{const u=new URL(String(v));return u.protocol==='https:'&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}};
/** A contracted vendor's defensive summaries only. No crawler, dumps or attachments.
 * Binding credentials to one organization prevents accidental cross-tenant queries.
 */
export function licensedFeedProvider(env:Record<string,string|undefined>=process.env,fetcher:typeof safeFetch=safeFetch):DarkWebProvider{
 const category=():DarkWebSourceCategory=>DARK_WEB_SOURCE_CATEGORIES.includes(env.DEEPWATCH_FEED_CATEGORY as DarkWebSourceCategory)&&env.DEEPWATCH_FEED_CATEGORY!=='development_fixture'?env.DEEPWATCH_FEED_CATEGORY as DarkWebSourceCategory:'licensed_intelligence';
 const configured=()=>Boolean(sourceUrl(env.DEEPWATCH_FEED_URL)&&env.DEEPWATCH_FEED_TOKEN&&env.DEEPWATCH_FEED_ORGANIZATION_ID&&env.DEEPWATCH_FEED_SAFE_METADATA_ONLY==='true'&&sourceUrl(env.DEEPWATCH_FEED_TERMS_URL));
 let retryAt=0;
 return {
  metadata:{id:'licensed-threat-feed',name:env.DEEPWATCH_FEED_NAME||'Licensed threat-intelligence feed',description:'Tenant-bound defensive summaries from a contracted, reviewed vendor; no illicit-market interaction.',
   sourceCategories:[category()],supportedEntityTypes:[...DARK_WEB_ENTITY_TYPES],authenticationRequirements:['Reviewed vendor contract, safe-metadata filtering and tenant-bound token'],
   environmentVariables:['DEEPWATCH_FEED_URL','DEEPWATCH_FEED_TOKEN','DEEPWATCH_FEED_ORGANIZATION_ID','DEEPWATCH_FEED_SAFE_METADATA_ONLY','DEEPWATCH_FEED_TERMS_URL','DEEPWATCH_FEED_CATEGORY','DEEPWATCH_FEED_NAME'],
   rateLimitPerMinute:30,timeoutMs:15000,enabled:true,commercialUse:'review_required',retentionHours:2160,supportsHistoricalSearch:true,supportsContinuousMonitoring:true,supportsOriginalTimestamps:true,supportsSourceReferences:true,attachmentBehavior:'none'},
  supports(q){return q.query.trim().length>=3;},
  validateConfiguration(){return {valid:configured(),errors:configured()?[]:['Reviewed, tenant-bound, safe-metadata-only vendor feed is not configured.']};},
  async health(){return configured()?{status:'healthy'}:{status:'misconfigured',detail:'Configure reviewed vendor, tenant binding and safe-metadata contract.'};},
  async search(query,context){
   if(!configured()||context.organizationId!==env.DEEPWATCH_FEED_ORGANIZATION_ID||!context.allowedTerms?.some(t=>fold(t)===fold(query.query)))throw new Error('A registered query and tenant-bound feed are required.');
   if(Date.now()<retryAt||isRateLimited(`deepwatch:licensed:${context.organizationId}`,30))throw new Error('Vendor request limit reached.');
   const response=await fetcher(env.DEEPWATCH_FEED_URL!,{maxRedirects:0,method:'POST',headers:{Authorization:`Bearer ${env.DEEPWATCH_FEED_TOKEN}`,'Content-Type':'application/json'},
    signal:AbortSignal.any([context.signal,AbortSignal.timeout(15000)]),cache:'no-store',body:JSON.stringify({query:query.query,entityTypes:query.entityTypes,limit:Math.min(query.limit,50)})});
   if(response.status===429){const h=response.headers.get('retry-after');retryAt=Date.now()+Math.max(60,Number(h)||((Date.parse(h??'')-Date.now())/1000)||60)*1000;}
   if(!response.ok)throw new Error('Licensed metadata unavailable.');
   // boundedJson consumes only the response body: never fetch linked evidence or attachments.
   const payload=await boundedJson(response as unknown as Request,1_000_000) as {results?:unknown};
   if(!Array.isArray(payload?.results))throw new Error('Invalid defensive metadata response.');
   const now=new Date().toISOString();
   return payload.results.slice(0,Math.min(query.limit,50)).flatMap((value:unknown):DarkWebRawMention[]=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return [];
    const v=value as Record<string,unknown>;
    if(['attachments','rawDump','passwords','credentials','binary','html'].some(k=>Object.hasOwn(v,k)))return [];
    const originalText=clean(v.text),id=clean(typeof v.id==='number'&&Number.isFinite(v.id)?String(v.id):v.id,200),identifiers=Array.isArray(v.identifiers)?v.identifiers.filter((x):x is string=>typeof x==='string').slice(0,20):[];
    if(!id||!originalText||!identifiers.some(i=>context.allowedTerms!.some(t=>fold(t)===fold(i))))return [];
    const publishedAt=typeof v.publishedAt==='string'&&Number.isFinite(Date.parse(v.publishedAt))&&Date.parse(v.publishedAt)<=Date.now()?new Date(v.publishedAt).toISOString():undefined;
    const mention:DarkWebRawMention={providerDocumentId:id,sourceCategory:category(),sourceName:clean(v.sourceName,200)||env.DEEPWATCH_FEED_NAME||'Licensed threat-intelligence feed',sourceReference:sourceUrl(v.sourceReference)??env.DEEPWATCH_FEED_TERMS_URL,
     publishedAt,firstSeenAt:now,lastSeenAt:now,originalLanguage:clean(v.language,10)||undefined,originalText,title:clean(v.title,300),
     sourceReliability:Number.isFinite(Number(v.reliability))?Math.round(Math.max(0,Math.min(100,Number(v.reliability)))):50,matchedIdentifiers:identifiers,threatCategories:Array.isArray(v.categories)?v.categories.map(c=>clean(c,80)).filter(Boolean).slice(0,20):[]};
    return safeMetadata(mention)?[mention]:[];
   });
  },
  normalize(raw){return raw;},redact(raw){return {...raw,originalText:raw.originalText.slice(0,2000)};}
 };
}
