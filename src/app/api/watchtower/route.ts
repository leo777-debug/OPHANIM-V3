import { NextRequest,NextResponse } from 'next/server';
import { effectiveCamera } from '@/lib/watchtower/catalogue';
import { cameraPortsWithSources,cameraPolicy,legacyCameraResult } from '@/lib/watchtower/search';
import { getClientIp,isRateLimited } from '@/lib/ssrf-guard';
import { db } from '@/lib/watchlists/db';
export async function GET(request:NextRequest){
 if(isRateLimited(`watchtower:${getClientIp(request)}`,60))return NextResponse.json({error:'Camera search request limit reached.'},{status:429});
 const legacyPort=request.nextUrl.searchParams.get('port');
 const {ports,warnings}=await cameraPortsWithSources((legacyPort??request.nextUrl.searchParams.get('q')??'').slice(0,160));
 if(legacyPort&&ports.length!==1)return NextResponse.json({error:'One known port is required.'},{status:400});
 let health:Array<{feed_id:string;status:string;last_seen:string|null}>=[];
 if(process.env.DATABASE_URL)try{health=(await db().query('select * from ophanim_camera_health')).rows;}catch{/* Catalogue remains explicit when health storage is unavailable. */}
 for(const port of ports)port.cameras=port.cameras.map(c=>({...c,...effectiveCamera(c,health.find(h=>h.feed_id===c.id))}));
 return NextResponse.json(legacyPort?legacyCameraResult(ports[0],warnings,request.nextUrl.searchParams.get('dead')==='1'):{ports,health,warnings,policy:cameraPolicy,notice:'Best-effort public coverage. Empty/offline cameras never mean all clear.'},{headers:{'Cache-Control':'public, max-age=60'}});
}
