import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { getShipment } from '@/lib/logistics/shipments';
import { db } from '@/lib/watchlists/db';
import { platformError } from '@/lib/platform/http';
import { callForecastWorker,requireSameOrigin,uuid } from '@/lib/forecast/http';
export async function GET(request:NextRequest){try{
 const actor=await requireAuthenticatedActor(request,'intelligence:read');const shipment=request.nextUrl.searchParams.get('shipment');
 if(!uuid(shipment))throw new Error('Shipment UUID required.');
 const forecasts=await db().query(`select f.*,q.question_text,q.question_type,q.threshold,q.status as question_status,o.outcome,o.actual_at,
  s.brier,s.log_loss,s.interval_hit from ophanim_forecasts f
  join ophanim_forecast_questions q on q.id=f.question_id and q.organization_id=f.organization_id
  left join ophanim_forecast_outcomes o on o.question_id=q.id and o.organization_id=f.organization_id
  left join ophanim_forecast_scores s on s.forecast_id=f.id and s.organization_id=f.organization_id
  where f.organization_id=$1 and f.shipment_id=$2 order by f.issued_at desc limit 100`,[actor.organizationId,shipment]);
 const rollups=await db().query(`select source_type,analyst_key,n,mean_brier,mean_log_loss,calibration_bins,month from ophanim_forecast_score_rollups where organization_id=$1 and lane in(select features->>'lane' from ophanim_feature_snapshots where organization_id=$1 and shipment_id=$2) order by month desc limit 24`,[actor.organizationId,shipment]);
 const questions=await db().query("select id,question_text from ophanim_forecast_questions where organization_id=$1 and shipment_id=$2 and status='open' and resolve_by>now() order by created_at desc",[actor.organizationId,shipment]);
 return NextResponse.json({forecasts:forecasts.rows,trackRecord:rollups.rows,questions:questions.rows},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
export async function POST(request:NextRequest){try{
 requireSameOrigin(request);const actor=await requireAuthenticatedActor(request,'intelligence:write');
 if(actor.authProvider==='presentation-demo')throw new Error('Sign-in required for forecast issuance.');
 const body=await request.json() as {shipmentId?:unknown};if(!uuid(body.shipmentId))throw new Error('Shipment UUID required.');
 if(!await getShipment(actor,body.shipmentId))return NextResponse.json({error:'Shipment not found.'},{status:404});
 return NextResponse.json(await callForecastWorker('/forecast',{organization_id:actor.organizationId,shipment_id:body.shipmentId}),{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
