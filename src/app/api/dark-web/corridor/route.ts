import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { shipmentMentions } from '@/lib/dark-web/corridor';
import { platformError } from '@/lib/platform/http';
import { db } from '@/lib/watchlists/db';
import { uuid } from '@/lib/forecast/http';
export async function GET(request:NextRequest){try{
 const actor=await requireAuthenticatedActor(request,'intelligence:read');
 const params=request.nextUrl.searchParams,jobFileId=params.get('jobFileId');
 let shipmentId=params.get('shipment')??params.get('shipmentId');
 if((jobFileId&&shipmentId)||(params.has('shipment')&&params.has('shipmentId')&&params.get('shipment')!==params.get('shipmentId')))throw new Error('Select one shipment or job file.');
 if(jobFileId){
  if(!uuid(jobFileId))throw new Error('Job file UUID required.');
  const job=(await db().query('select shipment_id from ophanim_job_files where id=$1 and organization_id=$2',[jobFileId,actor.organizationId])).rows[0];
  if(!job)return NextResponse.json({error:'Job file not found.'},{status:404});
  if(!job.shipment_id)return NextResponse.json({mentions:[],assessments:[],features:{dw_mention_count:0,dw_strongest_match:null,dw_strongest_match_rank:0,dw_max_assessment_confidence:0,dw_logistics_threats:0},note:'Link this job file to a shipment before corridor matching. Coverage unknown.'},{headers:{'Cache-Control':'private, no-store'}});
  shipmentId=job.shipment_id;
 }
 if(!uuid(shipmentId))throw new Error('Shipment UUID required.');
 if(!(await db().query('select id from ophanim_shipments where id=$1 and organization_id=$2',[shipmentId,actor.organizationId])).rows.length)return NextResponse.json({error:'Shipment not found.'},{status:404});
 const rows=await shipmentMentions(actor,shipmentId),strength=['exact_imo','exact_mmsi','exact_callsign','exact_unlocode','exact_domain','exact_ip','exact_client_identifier','exact_vendor_product','vessel_alias_owner','port_terminal','company_domain','product_dependency','name_context','weak_name'];
 const featureRows=rows.filter(r=>r.source_category!=='development_fixture');
 const methods=featureRows.map(r=>String(r.match_method)).filter(m=>strength.includes(m)).sort((a,b)=>strength.indexOf(a)-strength.indexOf(b));
 const strongest=methods[0]??null;
 const assessments=(await db().query("select * from ophanim_signal_assessments where organization_id=$1 and subject_type='shipment' and subject_id=$2 order by confidence_score desc limit 100",[actor.organizationId,shipmentId])).rows;
 const mentions=rows.map(r=>({...r,sourceName:r.source_name,sourceCategory:r.source_category,sourceReference:r.source_reference,reliability:r.source_reliability,threatCategories:r.threat_categories,firstSeenAt:r.first_seen_at,reviewStatus:r.review_status,why:[`${r.match_method} on ${r.entity_type}: ${r.canonical_name} (\"${r.matched_text}\"); confidence contribution ${r.confidence_contribution}`],label:'UNVERIFIED claim from a monitored source'}));
 const categories=featureRows.flatMap(r=>Array.isArray(r.threat_categories)?r.threat_categories:[]);
 const activeIds=new Set(featureRows.map(r=>r.id));
 return NextResponse.json({mentions,assessments,features:{dw_mention_count:activeIds.size,dw_strongest_match:strongest,dw_strongest_match_rank:strongest?strength.length-strength.indexOf(strongest):0,dw_max_assessment_confidence:Math.max(0,...assessments.filter(a=>activeIds.has(a.mention_id)).map(a=>Number(a.confidence_score)||0))/100,dw_logistics_threats:new Set(categories.filter(c=>['cargo_theft','smuggling','sanctions_evasion_brokering','fraudulent_bills_of_lading','fraudulent_bill_of_lading','logistics_fraud'].includes(c))).size},note:'Noisy, unverified claims. Confidence and provenance are screening aids; mark false positives in the intelligence review queue.'},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
