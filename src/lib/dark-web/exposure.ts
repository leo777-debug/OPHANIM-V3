import { findRegisteredEntities,synchronizeOperationalEntities } from './entity-registry';
import { runDarkWebSearch } from './index';
import { storeDarkWebMentions } from './mention-store';
import { DARK_WEB_ENTITY_TYPES } from './types';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import { reconcileIntelligence } from '@/lib/intelligence/operations';
import type { OrganizationActor } from '@/lib/operations/types';
import { hibpProvider } from './hibp-provider';
import { licensedFeedProvider } from './licensed-providers';
import { tenantTerms } from './scope';

export function configuredExposureOrganizations(){
 return [...new Set([hibpProvider.validateConfiguration().valid?process.env.HIBP_ORGANIZATION_ID:null,licensedFeedProvider().validateConfiguration().valid?process.env.DEEPWATCH_FEED_ORGANIZATION_ID:null].filter((s):s is string=>Boolean(s&&/^[0-9a-f-]{36}$/i.test(s))))];
}
export async function scanTenantExposure(actor:OrganizationActor,signal:AbortSignal){
 requireOrganizationAccess(actor,actor.organizationId,'intelligence:write');
 await synchronizeOperationalEntities(actor);
 const entities=await findRegisteredEntities(actor);
 // Bound each run; process domains first and rotate other identifiers hourly. Fixtures
 // stay available for explicit demo scans, never background customer monitoring.
 const terms=tenantTerms(entities.filter(e=>['domain','vessel','port','terminal','carrier','client','company','shipment'].includes(e.entityType)));
 const domains=entities.filter(e=>e.entityType==='domain').map(e=>e.canonicalName),others=terms.filter(t=>!domains.includes(t));
 const hour=Math.floor(Date.now()/3600000),offset=others.length?hour*2%others.length:0;
 const queries=[...(domains.length?[domains[hour%domains.length]]:[]),...[...others.slice(offset),...others.slice(0,offset)].slice(0,2)];
 let stored=0;const errors:string[]=[];
 for(const query of queries){
  if(signal.aborted)break;
  const result=await runDarkWebSearch(query,[...DARK_WEB_ENTITY_TYPES],{organizationId:actor.organizationId,signal,allowedTerms:terms});
  for(const d of result.diagnostics){
   if(d.providerId==='development-fixtures'||d.providerId==='mock-dark-web')continue;
   if(d.error){errors.push(`${d.providerId}: ${d.error}`);continue;}
   stored+=(await storeDarkWebMentions(actor,d.providerId,result.mentions.filter(m=>m.providerId===d.providerId&&m.mention.sourceCategory!=='development_fixture').map(m=>m.mention))).length;
  }
 }
 return {queries:queries.length,stored,errors:[...new Set(errors)],reconciliation:await reconcileIntelligence(actor)};
}
