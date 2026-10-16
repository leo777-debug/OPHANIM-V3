import { NextRequest,NextResponse } from 'next/server';
import { isFeedId } from '@/lib/presentation/feeds';
import { presentationFeed } from '@/lib/presentation/snapshots';
import { presentationSettingsOrOff } from '@/lib/presentation/settings';
export const dynamic='force-dynamic';
export const maxDuration=45;
export async function GET(_request:NextRequest,context:{params:Promise<{id:string}>}) {
  const {id}=await context.params;
  if(!isFeedId(id))return NextResponse.json({error:'Unknown public map feed.'},{status:404});
  const settings=await presentationSettingsOrOff();
  try {
    // Both map surfaces use the same fixed public projection. Never tenant adapters.
    const feed=await presentationFeed(id,settings.enabled?settings.replay:'off');
    return NextResponse.json({feed},{headers:{'Cache-Control':'no-store'}});
  }catch{
    return NextResponse.json({error:'Public map source temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
