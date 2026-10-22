import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { buildRouteLens } from '@/lib/route-intelligence/lens';
import { platformError } from '@/lib/platform/http';
import { uuid } from '@/lib/forecast/http';
export async function GET(request:NextRequest){try{
 const actor=await requireAuthenticatedActor(request,'route:read'),shipment=request.nextUrl.searchParams.get('shipment');
 if(!uuid(shipment))throw new Error('Shipment UUID required.');
 const lens=await buildRouteLens(actor,shipment);
 return NextResponse.json(lens??{error:'Shipment not found.'},{status:lens?200:404,headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
