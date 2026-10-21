import { db } from '@/lib/watchlists/db';
import { cameraCatalogue } from './catalogue';

// No user-supplied URL ever reaches this checker. Explicit opt-in per catalogue entry.
// A reachable page/manifest is not proof of fresh camera imagery.
export async function checkCameraHealth() {
 let checked=0;
 for(const feed of cameraCatalogue.filter(c=>c.healthCheckAllowed&&c.publicViewingVerified)) {
  const url=new URL(feed.sourceUrl);
  if(url.protocol!=='https:'||url.username||url.password)continue;
  const previous=await db().query('select 1 from ophanim_camera_health where feed_id=$1 and checked_at>now()-interval \'30 minutes\'',[feed.id]);
  if(previous.rowCount)continue;
  let status='unverified',detail='Endpoint reachable; playback freshness unverified.';
  try { const response=await fetch(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(6000)});
   if(!response.ok){status=response.status===404||response.status===410?'offline':'unverified';detail=`Source HTTP ${response.status}; no circumvention attempted.`;}
  }catch{detail='Source health request failed; conditions unknown.';}
  await db().query(`insert into ophanim_camera_health(feed_id,checked_at,status,detail) values($1,now(),$2,$3)
   on conflict(feed_id) do update set checked_at=excluded.checked_at,status=excluded.status,detail=excluded.detail`,[feed.id,status,detail]);
  checked++;
 }
 return {checked,coverage:'best_effort'};
}
