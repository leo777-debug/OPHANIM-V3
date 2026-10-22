import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { db } from '@/lib/watchlists/db';
import { platformError } from '@/lib/platform/http';
import { requireSameOrigin,uuid } from '@/lib/forecast/http';
export async function POST(request:NextRequest){try{
 requireSameOrigin(request);const actor=await requireAuthenticatedActor(request,'intelligence:write');
 if(actor.authProvider==='presentation-demo')throw new Error('Sign-in required.');
 const b=await request.json() as Record<string,unknown>;
 if(!uuid(b.questionId)||typeof b.outcome!=='boolean'||typeof b.evidenceUrl!=='string'||typeof b.reasoning!=='string'||b.reasoning.length<10||b.reasoning.length>4000)throw new Error('Question, binary outcome, HTTPS evidence and reviewer reasoning required.');
 const url=new URL(b.evidenceUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Public HTTPS evidence URL required.');
 const actualAt=b.actualAt?String(b.actualAt):null;
 if(actualAt&&(!Number.isFinite(Date.parse(actualAt))||Date.parse(actualAt)>Date.now()))throw new Error('Actual time cannot be invalid or in the future.');
 const client=await db().connect();
 try{
  await client.query('begin');
  const question=await client.query('select id from ophanim_forecast_questions where organization_id=$1 and id=$2 and status=\'open\' and resolve_by<=now() for update',[actor.organizationId,b.questionId]);
  if(!question.rowCount)throw new Error('Unresolved tenant question with a passed horizon required.');
  await client.query(`insert into ophanim_forecast_outcomes(organization_id,question_id,outcome,actual_at,resolution_source,reviewer_user_id,evidence,intervention)
   values($1,$2,$3,$4,'manual',$5,$6,$7)`,[actor.organizationId,b.questionId,b.outcome,actualAt,actor.userId,JSON.stringify({url:url.toString(),reasoning:b.reasoning}),b.intervention===true]);
  await client.query('update ophanim_forecast_questions set status=\'resolved\' where organization_id=$1 and id=$2',[actor.organizationId,b.questionId]);
  await client.query(`insert into ophanim_audit_events(organization_id,actor_user_id,action,subject_type,subject_id,metadata) values($1,$2,'forecast.resolved','forecast_question',$3,$4)`,[actor.organizationId,actor.userId,b.questionId,JSON.stringify({intervention:b.intervention===true})]);
  await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 return NextResponse.json({status:'resolved',scoring:'next intelligence/worker cycle'},{status:201,headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
