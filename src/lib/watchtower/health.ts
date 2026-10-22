import { db } from '@/lib/watchlists/db';
import { cameraCatalogue } from './catalogue';

// No user-supplied URL ever reaches this checker. Explicit opt-in per catalogue entry.
// A reachable page/manifest is not proof of fresh camera imagery.
export async function checkCameraHealth() {
 let checked=0;
 for(const feed of cameraCatalogue.filter(c=>c.healthCheckAllowed&&c.publicViewingVerified)) {
  const url=new URL(feed.sourceUrl);
  if(url.protocol!=='https:'||url.username||url.password)continue;
  const previous=await db().query('select consecutive_failures,checked_at from ophanim_camera_health where feed_id=$1',[feed.id]);
  const last=previous.rows[0];if(last&&Date.now()-new Date(last.checked_at).getTime()<30*60000)continue;
  let status='unverified',detail='Endpoint reachable; playback freshness unverified.';
  let failures=0;
  try { const response=await fetch(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(6000)});
   if(!response.ok){failures=Math.min(100,(last?.consecutive_failures??0)+1);status=failures>=3?'offline':'unverified';detail=`Source HTTP ${response.status}; ${failures} consecutive failures; no circumvention attempted.`;}
  }catch{failures=Math.min(100,(last?.consecutive_failures??0)+1);status=failures>=3?'offline':'unverified';detail='Source health request failed; conditions unknown.';}
  await db().query(`insert into ophanim_camera_health(feed_id,checked_at,status,detail,consecutive_failures) values($1,now(),$2,$3,$4)
   on conflict(feed_id) do update set checked_at=excluded.checked_at,status=excluded.status,detail=excluded.detail,consecutive_failures=excluded.consecutive_failures`,[feed.id,status,detail,failures]);
  checked++;
 }
 return {checked,coverage:'best_effort'};
}
