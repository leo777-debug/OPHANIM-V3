import {writeFile} from 'node:fs/promises';

if(!process.argv.includes('--live'))throw new Error('Use --live explicitly. This is one normal feed fetch, not a load test.');
const origin=process.env.PRESENTATION_PREVIEW_URL ?? 'http://127.0.0.1:3108';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw new Error('Live feed check is restricted to the local preview.');
const ids=['flights','maritime','ports','chokepoints','cameras','broadcasts','conflicts','infrastructure','war-sanctions','earthquakes','fires','weather','satellites','cables','incidents','cyber','news','space-weather'];
const feeds=await Promise.all(ids.map(async id=>{
  try {
    const response=await fetch(`${origin}/api/presentation/feed/${id}`,{signal:AbortSignal.timeout(50000)});
    const {feed}=await response.json();
    if(!response.ok || !feed || feed.testFixture)throw new Error('Expected a real public feed response, not a fixture');
    return {id,state:feed.state,markers:feed.features.length,news:feed.news.length,reference:feed.reference,observedAt:feed.observedAt,fetchedAt:feed.fetchedAt,note:feed.note};
  } catch { return {id,state:'check-failed',markers:0,note:'Local feed request did not complete.'}; }
}));
const result={checkedAt:new Date().toISOString(),liveSourceCheck:true,syntheticFixtures:false,feeds};
await writeFile('presentation-evidence/live-feeds.json',JSON.stringify(result,null,2));
for(const feed of feeds)console.log(`${feed.id}: ${feed.state}; ${feed.markers} markers${feed.news?`; ${feed.news} news`:''}`);
if(feeds.some(feed=>feed.state==='check-failed'))process.exitCode=1;
