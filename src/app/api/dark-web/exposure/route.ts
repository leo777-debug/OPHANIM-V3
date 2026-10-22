import { NextRequest,NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/dark-web/cron-auth';
import { scanTenantExposure,configuredExposureOrganizations } from '@/lib/dark-web/exposure';
import { db } from '@/lib/watchlists/db';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 if(!cronAuthorized(request,['INTELLIGENCE_ALERT_CRON_SECRET']))return NextResponse.json({error:'Unauthorized'},{status:401});
 const results=[];
 try{
  for(const organizationId of configuredExposureOrganizations()){
   const owner=(await db().query<{user_id:string;role:'owner'|'operations_manager'}>(`select user_id,role from ophanim_organization_memberships where organization_id=$1 and role in ('owner','operations_manager') order by case role when 'owner' then 0 else 1 end,created_at limit 1`,[organizationId])).rows[0];
   if(!owner){results.push({organizationId,error:'No authorized review owner.'});continue;}
   try{results.push({organizationId,...await scanTenantExposure({organizationId,userId:owner.user_id,role:owner.role},request.signal)});}catch{results.push({organizationId,error:'Tenant exposure scan unavailable.'});}
  }
  return NextResponse.json({results,note:'Only credential-bound organizations are scanned; all hits enter the existing review queue.'},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Exposure scan unavailable.'},{status:503});}
}
