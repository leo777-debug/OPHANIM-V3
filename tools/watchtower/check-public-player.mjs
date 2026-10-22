// Manual audit through the documented YouTube IFrame API. No video download,
// hidden stream extraction, re-streaming, credentials or global-health writes.
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const videoId='lgQ8-E3rJ_4';
const server=createServer((_req,res)=>{
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Ophanim manual public-player verification</title><div id="player"></div><script>
 var ready=false,errorCode=null,player;
 function onYouTubeIframeAPIReady(){player=new YT.Player('player',{width:960,height:540,videoId:'${videoId}',playerVars:{autoplay:1,mute:1},events:{onReady:function(){ready=true;player.mute();player.playVideo()},onError:function(e){errorCode=e.data}}})}
 </script><script src="https://www.youtube.com/iframe_api"></script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>window.ready||window.errorCode,{},{timeout:30000});
 await page.waitForFunction(()=>window.errorCode||window.player?.getPlayerState()===1,{},{timeout:30000});
 const first=await page.evaluate(()=>({state:player.getPlayerState(),time:player.getCurrentTime(),duration:player.getDuration(),errorCode}));
 await page.waitForTimeout(3000);
 const second=await page.evaluate(()=>({state:player.getPlayerState(),time:player.getCurrentTime(),duration:player.getDuration(),errorCode}));
 const playing=first.state===1&&second.state===1&&second.time>first.time+1&&!second.errorCode;
 const report={checkedAt:new Date().toISOString(),sourceUrl:`https://www.youtube.com/watch?v=${videoId}`,publisher:'DarGlobal',
  permission:'YouTube standard embedded player only; public publisher stream; branding/controls retained',
  method:'Manual IFrame API playback audit; no media stored',status:playing?'playback_verified':'unavailable',samples:[first,second],
  freshnessLimit:'API confirms advancing playback, not the age or geographic truth of camera imagery. UI live badge and waterfront imagery were manually observed separately.',
  coverage:'Approximate Yiti/AIDA coastal view near Muscat. Does not cover priority cargo ports or establish all clear.'};
 await mkdir('docs/verification',{recursive:true});await writeFile('docs/verification/camera-playback.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 if(!playing)process.exitCode=1;
}finally{await browser.close();server.close();}
