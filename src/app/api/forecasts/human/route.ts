import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { db } from '@/lib/watchlists/db';
import { platformError } from '@/lib/platform/http';
import { requireSameOrigin,uuid } from '@/lib/forecast/http';
export async function POST(request:NextRequest){try{
 requireSameOrigin(request);const actor=await requireAuthenticatedActor(request,'intelligence:write');
 if(actor.authProvider==='presentation-demo')throw new Error('Sign-in required.');
 const b=await request.json() as {questionId?:unknown;probability?:unknown;reasoning?:unknown};
 if(!uuid(b.questionId)||typeof b.probability!=='number'||!Number.isFinite(b.probability)||b.probability<0||b.probability>1||typeof b.reasoning!=='string'||b.reasoning.trim().length<10||b.reasoning.length>4000)throw new Error('Question, probability 0–1 and reasoning (10–4000 characters) required.');
 const result=await db().query(`insert into ophanim_forecasts(organization_id,shipment_id,question_id,source_type,user_id,probability,feature_snapshot_id,trigger)
  select q.organization_id,q.shipment_id,q.id,'human',$3,$4,s.id,$5 from ophanim_forecast_questions q
  join lateral(select id from ophanim_feature_snapshots where organization_id=q.organization_id and shipment_id=q.shipment_id order by as_of desc limit 1)s on true
  where q.organization_id=$1 and q.id=$2 and q.status='open' and q.resolve_by>now() returning id`,[actor.organizationId,b.questionId,actor.userId,b.probability,JSON.stringify({cause:'operator_call',reasoning:b.reasoning.trim()})]);
 if(!result.rowCount)throw new Error('Open tenant question and snapshot required.');
 return NextResponse.json({forecastId:result.rows[0].id},{status:201,headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
