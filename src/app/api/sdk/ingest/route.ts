import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { platformError } from '@/lib/platform/http';
import { limitedRequestBytes, RequestBodyLimitError } from '@/lib/http/limited-form-data';
import { isRateLimited } from '@/lib/ssrf-guard';
import { organizationSdkEntities, sdkStore } from '@/lib/sdk/store';

export async function POST(request: NextRequest) {
  const key=process.env.SDK_INGEST_KEY,organizationId=process.env.SDK_INGEST_ORGANIZATION_ID;
  if(!key || !organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId))return NextResponse.json({error:'SDK ingest key and organization must be configured.'},{status:503});
  try {
    const body=JSON.parse(Buffer.from(await limitedRequestBytes(request,2*1024*1024)).toString('utf8'));
    const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'') ?? body?.apiKey;
    if(typeof supplied!=='string' || Buffer.byteLength(supplied)!==Buffer.byteLength(key) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(key)))return NextResponse.json({error:'Invalid API key.'},{status:401});
    if(!body || typeof body.source!=='string' || !/^[a-z0-9_-]{1,80}$/i.test(body.source) || !Array.isArray(body.entities) || body.entities.length>1000)return NextResponse.json({error:'Expected source and up to 1000 entities.'},{status:400});
    if(isRateLimited(`sdk:ingest:${organizationId}`,30,60_000))return NextResponse.json({error:'Ingest limit reached.'},{status:429});
    const store=sdkStore();let accepted=0,rejected=0;
    for(const entity of body.entities) {
      const position=entity?.position;
      if(!entity || typeof entity.id!=='string' || !entity.id || entity.id.length>200 || !position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng) || Math.abs(position.lat)>90 || Math.abs(position.lng)>180){rejected++;continue;}
      const normalized={
        id:`ext-${body.source}-${entity.id}`,organizationId,
        name:typeof entity.name==='string' ? entity.name.slice(0,200):`ENTITY-${entity.id}`,
        domain:entity.domain ?? 'LAND',entityType:entity.entityType ?? 'TRACK',
        position:{lat:position.lat,lng:position.lng,alt:position.alt,heading:position.heading,speed:position.speed},
        threat:entity.threat ?? 'NONE',classification:entity.classification ?? 'UNCLASSIFIED',
        source:{provider:body.source,feed:'ingest-api',originalId:entity.id,confidence:entity.confidence ?? 0.8},
        timestamp:typeof entity.timestamp==='string' && Number.isFinite(Date.parse(entity.timestamp)) ? entity.timestamp:new Date().toISOString(),
        properties:entity.properties ?? {},display:entity.display ?? {color:'#2fd5ca',icon:'dot',layerType:'circle',glow:false,scale:1},
      };
      store.entities.set(`${organizationId}/${normalized.id}`,normalized);accepted++;
    }
    const own=[...store.entities.entries()].filter(([,entity])=>entity.organizationId===organizationId);
    for(const [id] of own.slice(0,Math.max(0,own.length-5000)))store.entities.delete(id);
    store.touch();store.log.push({organizationId,source:body.source,count:accepted,timestamp:new Date().toISOString()});
    if(store.log.length>100)store.log.splice(0,store.log.length-100);
    return NextResponse.json({accepted,rejected,errors:rejected ? ['Some entities had invalid identifiers or coordinates.']:[],timestamp:new Date().toISOString()});
  } catch(error) {
    return NextResponse.json({error:error instanceof RequestBodyLimitError ? 'SDK payload is too large.':'Invalid SDK payload.'},{status:error instanceof RequestBodyLimitError ? 413:400});
  }
}
export async function GET(request: NextRequest) {
  try {
    const actor=await requireAuthenticatedActor(request,'shipment:read');
    return NextResponse.json({sdk:'polybolos',version:'1.0.0',entityCount:organizationSdkEntities(actor.organizationId).length,recentIngestions:sdkStore().log.filter((item)=>item.organizationId===actor.organizationId).slice(-10),timestamp:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  } catch(error){return platformError(error);}
}
