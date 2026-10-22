import { db } from '@/lib/watchlists/db';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';

export async function shipmentMentions(actor:OrganizationActor,shipmentId:string,asOf=new Date().toISOString()){
 requireOrganizationAccess(actor,actor.organizationId,'intelligence:read');
 return (await db().query(`select distinct m.id,m.title,m.provider_id,m.source_category,m.source_name,m.source_reference,m.source_reliability,
  m.first_seen_at,m.review_status,m.threat_categories,x.entity_id,x.match_method,x.matched_text,e.canonical_name,e.entity_type,x.confidence_contribution,x.requires_review,
  a.id as assessment_id,a.confidence_score,a.confidence_level,a.confidence_breakdown
 from ophanim_shipments s
 join ophanim_entities e on e.organization_id=s.organization_id and (
  e.attributes->'shipmentIds' ? s.id::text or e.attributes->>'shipmentId'=s.id::text)
 join ophanim_mention_entity_matches x on x.entity_id=e.id
 join ophanim_dark_web_mentions m on m.id=x.mention_id and m.organization_id=s.organization_id
 left join ophanim_signal_assessments a on a.mention_id=m.id and a.organization_id=s.organization_id and a.subject_type='shipment' and a.subject_id=s.id
 where s.id=$1 and s.organization_id=$2 and m.first_seen_at<=$3 and m.review_status not in ('false_positive','duplicate','closed')
 order by m.first_seen_at desc limit 200`,[shipmentId,actor.organizationId,asOf])).rows;
}
