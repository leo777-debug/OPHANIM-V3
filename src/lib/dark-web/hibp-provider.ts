import type { DarkWebProvider } from './types';

const cooldown = new Map<string,number>();
// HIBP returns breach names/account aliases, never breach dumps. Retain only domain-level metadata.
export const hibpProvider:DarkWebProvider={
 metadata:{id:'hibp-domain',name:'Have I Been Pwned verified domains',description:'Subscription breach metadata for tenant-owned verified email domains; no passwords, dumps or attachments.',
  sourceCategories:['licensed_intelligence'],supportedEntityTypes:['domain'],authenticationRequirements:['HIBP subscription and verified domain'],
  environmentVariables:['HIBP_API_KEY','HIBP_ORGANIZATION_ID'],rateLimitPerMinute:1,timeoutMs:10000,enabled:true,commercialUse:'restricted',retentionHours:720,
  supportsHistoricalSearch:true,supportsContinuousMonitoring:true,supportsOriginalTimestamps:false,supportsSourceReferences:true,attachmentBehavior:'none'},
 supports(q){return q.entityTypes.includes('domain')&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(q.query);},
 validateConfiguration(){return {valid:Boolean(process.env.HIBP_API_KEY&&process.env.HIBP_ORGANIZATION_ID),errors:process.env.HIBP_API_KEY&&process.env.HIBP_ORGANIZATION_ID?[]:['HIBP tenant-bound subscription is not configured.']};},
 async health(){return this.validateConfiguration().valid?{status:'healthy'}:{status:'misconfigured',detail:'Tenant-bound HIBP subscription required.'};},
 async search(query,context){
  if(context.organizationId!==process.env.HIBP_ORGANIZATION_ID)throw new Error('HIBP subscription is not bound to this organization.');
  if(!context.allowedTerms?.some(t=>t.trim().toLowerCase()===query.query.trim().toLowerCase()))throw new Error('Registered tenant domain required.');
  if((cooldown.get('subscription')??0)>Date.now())throw new Error('HIBP rate limit cooldown; try later.');
  cooldown.set('subscription',Date.now()+60000);
  const response=await fetch(`https://haveibeenpwned.com/api/v3/breacheddomain/${encodeURIComponent(query.query)}`,{
   headers:{'hibp-api-key':process.env.HIBP_API_KEY!,'user-agent':'Ophanim defensive domain monitoring'},
   signal:AbortSignal.any([context.signal,AbortSignal.timeout(10000)]),redirect:'error',cache:'no-store'});
  if(response.status===404)return [];
  if(response.status===429){cooldown.set('subscription',Date.now()+Math.max(60,Number(response.headers.get('retry-after'))||60)*1000);throw new Error('HIBP rate limited.');}
  if(!response.ok)throw new Error(`HIBP unavailable (${response.status}); domain verification/subscription may be required.`);
  const body=await response.text();if(body.length>2_000_000)throw new Error('HIBP metadata response too large.');
  const result=JSON.parse(body) as Record<string,unknown>;
  const counts=new Map<string,number>();
  for(const value of Object.values(result))if(Array.isArray(value))for(const name of new Set(value.filter((x):x is string=>typeof x==='string'&&/^[\w .-]{1,120}$/.test(x))))counts.set(name,(counts.get(name)??0)+1);
  const now=new Date().toISOString();
  return [...counts].slice(0,query.limit).map(([name,accounts])=>({providerDocumentId:`${query.query}:${name}`,sourceCategory:'licensed_intelligence',sourceName:'Have I Been Pwned',sourceReference:`https://haveibeenpwned.com/PwnedWebsites#${encodeURIComponent(name)}`,
   firstSeenAt:now,lastSeenAt:now,title:`${accounts} account(s) at ${query.query} in breach metadata`,originalText:`${accounts} account(s) at ${query.query} appear in HIBP breach metadata: ${name}. Account aliases and secrets are not retained.`,sourceReliability:75,matchedIdentifiers:[query.query],threatCategories:['credential_exposure','credential_leak']}));
 },
 normalize(raw){return raw;},redact(raw){return {...raw,originalText:raw.originalText.slice(0,2000)};}
};
