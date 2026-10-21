import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { shipmentMentions } from '@/lib/dark-web/corridor';
import { platformError } from '@/lib/platform/http';
export async function GET(request:NextRequest){try{
 const actor=await requireAuthenticatedActor(request,'intelligence:read');
 const shipmentId=request.nextUrl.searchParams.get('shipment');
 if(!shipmentId||!/^[0-9a-f-]{36}$/i.test(shipmentId))return NextResponse.json({error:'Shipment UUID required.'},{status:400});
 return NextResponse.json({mentions:await shipmentMentions(actor,shipmentId)},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
