import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { getShipment } from '@/lib/logistics/shipments';
import { db } from '@/lib/watchlists/db';
import { platformError } from '@/lib/platform/http';
import { callForecastWorker,requireSameOrigin,uuid } from '@/lib/forecast/http';
import { boundedJson } from '@/lib/http/body';
import { GET as analystGET,POST as analystPOST,PATCH as analystPATCH } from './analyst/route';
export async function GET(request:NextRequest){try{
 if(!request.nextUrl.searchParams.has('shipment')&&!request.nextUrl.searchParams.has('shipmentId'))return analystGET(request);
 const actor=await requireAuthenticatedActor(request,'intelligence:read');const shipment=request.nextUrl.searchParams.get('shipment');
 const selected=shipment??request.nextUrl.searchParams.get('shipmentId');
 if(!uuid(selected)||(shipment&&request.nextUrl.searchParams.has('shipmentId')&&shipment!==request.nextUrl.searchParams.get('shipmentId')))throw new Error('One shipment UUID required.');
 const forecasts=await db().query(`select f.*,q.question_text,q.question_type,q.threshold,q.status as question_status,o.outcome,o.actual_at,
  s.brier,s.log_loss,s.interval_hit from ophanim_forecasts f
  join ophanim_forecast_questions q on q.id=f.question_id and q.organization_id=f.organization_id
  left join ophanim_forecast_outcomes o on o.question_id=q.id and o.organization_id=f.organization_id
  left join ophanim_forecast_scores s on s.forecast_id=f.id and s.organization_id=f.organization_id
  where f.organization_id=$1 and f.shipment_id=$2 order by f.issued_at desc limit 100`,[actor.organizationId,selected]);
 const rollups=await db().query(`select source_type,analyst_key,n,mean_brier,mean_log_loss,calibration_bins,month from ophanim_forecast_score_rollups where organization_id=$1 and lane in(select features->>'lane' from ophanim_feature_snapshots where organization_id=$1 and shipment_id=$2) order by month desc limit 24`,[actor.organizationId,selected]);
 const questions=await db().query("select id,question_text from ophanim_forecast_questions where organization_id=$1 and shipment_id=$2 and status='open' and resolve_by>now() order by created_at desc",[actor.organizationId,selected]);
 return NextResponse.json({forecasts:forecasts.rows,trackRecord:rollups.rows,questions:questions.rows},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
export async function POST(request:NextRequest){try{
 const value=await boundedJson(request,12000);
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Forecast JSON object required.');
 const body=value as {shipmentId?:unknown;question?:unknown};
 if(!Object.hasOwn(body,'shipmentId'))return analystPOST(new NextRequest(request.url,{method:'POST',headers:request.headers,signal:request.signal,body:JSON.stringify(value)}));
 if(Object.hasOwn(body,'question'))throw new Error('Specify a shipment forecast or a sourced analyst question, not both.');
 requireSameOrigin(request);const actor=await requireAuthenticatedActor(request,'intelligence:write');
 if(actor.authProvider==='presentation-demo')throw new Error('Sign-in required for forecast issuance.');
 if(!uuid(body.shipmentId))throw new Error('Shipment UUID required.');
 if(!await getShipment(actor,body.shipmentId))return NextResponse.json({error:'Shipment not found.'},{status:404});
 return NextResponse.json(await callForecastWorker('/forecast',{organization_id:actor.organizationId,shipment_id:body.shipmentId}),{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
// Preserve parity's original sourced-outcome endpoint as well as the named route.
export const PATCH=analystPATCH;
