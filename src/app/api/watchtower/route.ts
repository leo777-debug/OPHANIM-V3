import { NextRequest,NextResponse } from 'next/server';
import { searchCameraPorts,effectiveCamera } from '@/lib/watchtower/catalogue';
import { db } from '@/lib/watchlists/db';
export async function GET(request:NextRequest){
 const ports=searchCameraPorts((request.nextUrl.searchParams.get('q')??'').slice(0,160));
 let health:Array<{feed_id:string;status:string;last_seen:string|null}>=[];
 if(process.env.DATABASE_URL)try{health=(await db().query('select * from ophanim_camera_health')).rows;}catch{/* Catalogue remains explicit when health storage is unavailable. */}
 for(const port of ports)port.cameras=port.cameras.map(c=>({...c,...effectiveCamera(c,health.find(h=>h.feed_id===c.id))}));
 return NextResponse.json({ports,health,notice:'Best-effort public coverage. Empty/offline cameras never mean all clear.'},{headers:{'Cache-Control':'public, max-age=60'}});
}
