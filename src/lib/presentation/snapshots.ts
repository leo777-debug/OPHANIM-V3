import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import { normalizePublicFeed, feedIds, PRESENTATION_FEEDS } from './feeds';
import type { FeedId, PublicFeed, PresentationFeed, ReplayMode } from './types';
import { loadPublicPayload } from './public-loaders';

const inFlight=new Map<FeedId,Promise<PublicFeed>>();
const liveCache=new Map<FeedId,{data:PublicFeed;until:number}>();
export async function currentPublicFeed(id:FeedId):Promise<PublicFeed> {
  const cached=liveCache.get(id);
  if (cached && cached.until>Date.now()) return cached.data;
  const pending=inFlight.get(id);
  if(pending)return pending;
  const work=(async()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const budget=['maritime','ports','chokepoints'].includes(id)?40000:['cameras','war-sanctions'].includes(id)?22000:14000;
      const payload=await Promise.race([loadPublicPayload(id),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Public feed timed out.')),budget);})]);
      const data=normalizePublicFeed(id,payload);
      const ttl=id==='cameras'?60000:data.reference?300000:30000;
      liveCache.set(id,{data,until:Date.now()+ttl});
      return data;
    }finally{if(timer)clearTimeout(timer);inFlight.delete(id);}
  })();
  inFlight.set(id,work);
  return work;
}
export async function readSnapshot(id:FeedId):Promise<{data:PublicFeed;recordedAt:string}|null> {
  if(!process.env.DATABASE_URL)return null;
  const result=await db().query<{payload:PublicFeed;recorded_at:string|Date}>('select payload,recorded_at from ophanim_presentation_snapshots where feed_id=$1',[id]);
  return result.rows[0]?{data:result.rows[0].payload,recordedAt:new Date(result.rows[0].recorded_at).toISOString()}:null;
}
export async function presentationFeed(id:FeedId,replay:ReplayMode):Promise<PresentationFeed> {
  if(replay!=='on') {
    try {const data=await currentPublicFeed(id);return {...data,state:data.reference?'reference':'live',recordedAt:null};}catch{}
  }
  if(replay!=='off') {
    try {const snapshot=await readSnapshot(id);if(snapshot)return {...snapshot.data,state:'replay',recordedAt:snapshot.recordedAt};}catch{}
  }
  const definition=PRESENTATION_FEEDS[id];
  return {id,features:[],news:[],sources:[],source:definition.source,sourceUrl:definition.url,fetchedAt:new Date().toISOString(),observedAt:null,reference:Boolean(definition.reference),note:replay==='on'?'No recorded snapshot available.':'Source unavailable; no current data received.',state:'unavailable',recordedAt:null};
}
export async function snapshotStatus() {
  const result=await db().query<{feed_id:string;recorded_at:string|Date;item_count:number}>('select feed_id,recorded_at,item_count from ophanim_presentation_snapshots order by feed_id');
  return result.rows.map(row=>({id:row.feed_id,recordedAt:new Date(row.recorded_at).toISOString(),count:row.item_count}));
}
export async function recordPublicSnapshots(actor:OrganizationActor) {
  requireOrganizationAccess(actor,actor.organizationId,'organization:manage');
  const captured=await Promise.allSettled(feedIds.map(id=>currentPublicFeed(id)));
  const client=await db().connect();
  try {
    await client.query('begin');
    const saved:string[]=[],unavailable:string[]=[];
    for (let i=0;i<captured.length;i++) {
      const item=captured[i];
      if(item.status!=='fulfilled'){unavailable.push(feedIds[i]);continue;}
      const payload=JSON.stringify(item.value);
      if(Buffer.byteLength(payload)>8*1024*1024){unavailable.push(feedIds[i]);continue;}
      await client.query(`insert into ophanim_presentation_snapshots(feed_id,payload,item_count,recorded_at) values($1,$2,$3,now()) on conflict(feed_id) do update set payload=excluded.payload,item_count=excluded.item_count,recorded_at=excluded.recorded_at`,[feedIds[i],payload,item.value.features.length+item.value.news.length]);
      saved.push(feedIds[i]);
    }
    await client.query(`insert into ophanim_private.presentation_audit(actor_user_id,organization_id,action,old_value,new_value) values($1,$2,'snapshot.recorded','{}',$3)`,[actor.userId,actor.organizationId,JSON.stringify({saved,unavailable})]);
    await client.query('commit');
    return {saved,unavailable};
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}
