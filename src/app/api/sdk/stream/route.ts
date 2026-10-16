import { NextRequest } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { platformError } from '@/lib/platform/http';
import { organizationSdkEntities, sdkStore } from '@/lib/sdk/store';

export const dynamic='force-dynamic';
export async function GET(request: NextRequest) {
  let actor;
  try {actor=await requireAuthenticatedActor(request,'shipment:read');}catch(error){return platformError(error);}
  const encoder=new TextEncoder();
  let heartbeat:ReturnType<typeof setInterval>|undefined,updates:ReturnType<typeof setInterval>|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
  let closed=false,controller:ReadableStreamDefaultController<Uint8Array>|undefined;
  const cleanup=()=>{
    if(closed)return;closed=true;clearInterval(heartbeat);clearInterval(updates);clearTimeout(expiry);
    request.signal.removeEventListener('abort',abort);
  };
  const abort=()=>{cleanup();try{controller?.close();}catch{}};
  const stream=new ReadableStream<Uint8Array>({
    start(output){
      controller=output;
      const send=(type:string,payload:unknown)=>{if(!closed)output.enqueue(encoder.encode(`data: ${JSON.stringify({type,payload,timestamp:new Date().toISOString()})}\n\n`));};
      send('status',{connected:true,entityCount:organizationSdkEntities(actor.organizationId).length,feedCount:0,latticeStatus:'disconnected',lastUpdate:new Date().toISOString(),uptime:0});
      let lastSent=0;
      heartbeat=setInterval(()=>{try{send('heartbeat',{entityCount:organizationSdkEntities(actor.organizationId).length});}catch{abort();}},15000);
      updates=setInterval(()=>{try{
        if(sdkStore().version>lastSent){lastSent=sdkStore().version;send('entity_update',organizationSdkEntities(actor.organizationId).slice(0,500));}
      }catch{abort();}},5000);
      // Reconnect through authentication periodically rather than retaining an expired session forever.
      expiry=setTimeout(abort,5*60_000);
      request.signal.addEventListener('abort',abort,{once:true});
      if(request.signal.aborted)abort();
    },
    cancel(){cleanup();},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'}});
}
