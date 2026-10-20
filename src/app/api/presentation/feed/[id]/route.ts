import { NextRequest,NextResponse } from 'next/server';
import { presentationAdmin,presentationFailure } from '@/lib/presentation/http';
import { readPresentationSettings } from '@/lib/presentation/settings';
import { isFeedId } from '@/lib/presentation/feeds';
import { presentationFeed } from '@/lib/presentation/snapshots';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}) {
  try {
    const id=(await context.params).id;
    if(!isFeedId(id))return NextResponse.json({error:'Unknown public feed.'},{status:404});
    const settings=await readPresentationSettings();
    if(!settings.enabled)await presentationAdmin(request);
    return NextResponse.json({feed:await presentationFeed(id,settings.replay)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return presentationFailure(error);}
}
