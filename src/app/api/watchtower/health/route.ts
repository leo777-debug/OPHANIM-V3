import { NextRequest,NextResponse } from 'next/server';
import { checkCameraHealth } from '@/lib/watchtower/health';
import { cronAuthorized } from '@/lib/dark-web/cron-auth';
export async function POST(request:NextRequest){
 if(!cronAuthorized(request,['JOBFILE_CRON_SECRET','INTELLIGENCE_ALERT_CRON_SECRET']))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{return NextResponse.json(await checkCameraHealth(),{headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({error:'Camera health unavailable; coverage unknown.'},{status:503});}
}
