import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { requireSameOrigin,uuid } from '@/lib/forecast/http';
import { platformError } from '@/lib/platform/http';
import { db } from '@/lib/watchlists/db';
import { getShipment } from '@/lib/logistics/shipments';
import { parseRoadInput,routeRoadLeg } from '@/lib/route-intelligence/road';
import { searchProviders } from '@/lib/providers';
import { priorityPorts,distanceKm } from '@/lib/watchtower/catalogue';
import { findReferencePorts } from '@/lib/route-intelligence/open-network';

let nextGeocodeAt=0;

export async function GET(request:NextRequest){try{
 await requireAuthenticatedActor(request,'route:read');
 const q=request.nextUrl.searchParams.get('q')?.trim()??'';
 if(q.length<3||q.length>160)throw new Error('Location search must contain 3–160 characters.');
 // Reuse the registry geocoder. Ambiguous addresses require an explicit selection.
 if(Date.now()<nextGeocodeAt)return NextResponse.json({error:'Wait a second before searching again.'},{status:429});
 nextGeocodeAt=Date.now()+1100;
 const result=await searchProviders({query:q,limit:'5'});
 return NextResponse.json({locations:result.results.filter(r=>r.provider==='nominatim').map(r=>({label:r.label,lat:r.lat,lon:r.lng})),configured:Boolean(process.env.ROAD_ROUTER_URL)},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}

export async function POST(request:NextRequest){try{
 const actor=await requireAuthenticatedActor(request,'route:write');requireSameOrigin(request);
 if(Number(request.headers.get('content-length')??0)>10000)throw new Error('Road request too large.');
 const text=await request.text();if(text.length>10000)throw new Error('Road request too large.');
 const body=JSON.parse(text);
 if(!uuid(body.shipmentId))throw new Error('Shipment UUID required.');
 const shipment=await getShipment(actor,body.shipmentId);if(!shipment)return NextResponse.json({error:'Shipment not found.'},{status:404});
 const input=parseRoadInput(body);
 const code=input.side==='origin'?shipment.originPortCode:shipment.destinationPortCode;
 const port=priorityPorts.find(p=>p.code===code);
 const refs=port?[]:(await findReferencePorts(code??'')).filter(p=>p.code===code);
 const position=port??(refs.length===1?{lat:refs[0].coordinates[1],lon:refs[0].coordinates[0]}:null);
 if(!position)throw new Error('Resolve the shipment port before planning its road leg.');
 const gate=input.side==='origin'?input.to:input.from;
 if(distanceKm(gate,position)>30)throw new Error('Selected public gate must be within 30 km of the shipment port.');
 const leg=await routeRoadLeg(input);
 const client=await db().connect();
 try{
  await client.query('begin');
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,1))',[body.shipmentId]);
  const route=await client.query('select id from ophanim_routes where organization_id=$1 and shipment_id=$2 and archived_at is null order by updated_at desc limit 1 for update',[actor.organizationId,body.shipmentId]);
  const id=route.rows[0]?.id??(await client.query(`insert into ophanim_routes(organization_id,shipment_id,route_name,created_by_user_id) values($1,$2,$3,$4) returning id`,[actor.organizationId,body.shipmentId,`${shipment.shipmentReference} route`,actor.userId])).rows[0].id;
  await client.query(`update ophanim_routes set metadata=jsonb_set(metadata,'{road_legs}',coalesce(metadata->'road_legs','{}')||jsonb_build_object($3::text,$4::jsonb)),updated_at=now() where id=$1 and organization_id=$2`,[id,actor.organizationId,input.side,JSON.stringify(leg)]);
  await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 return NextResponse.json({leg},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return platformError(error);}}
