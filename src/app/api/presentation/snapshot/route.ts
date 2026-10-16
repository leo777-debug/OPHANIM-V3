import { NextRequest,NextResponse } from 'next/server';
import { presentationAdmin,presentationFailure } from '@/lib/presentation/http';
import { recordPublicSnapshots } from '@/lib/presentation/snapshots';
import { getClientIp,isRateLimited } from '@/lib/ssrf-guard';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:NextRequest) {
  try {
    const actor=await presentationAdmin(request);
    if(isRateLimited(`presentation:snapshot:${actor.userId}:${getClientIp(request)}`,2))return NextResponse.json({error:'Wait a minute before recording again.'},{status:429});
    return NextResponse.json(await recordPublicSnapshots(actor),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return presentationFailure(error);}
}
