'use client';
import {useEffect,useRef,useState} from 'react';
import Hls from 'hls.js';
import {playable,type CameraFeed} from '@/lib/watchtower/catalogue';
export default function CameraTile({camera}:{camera:CameraFeed}){
 const root=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null),[failed,setFailed]=useState(false);
 const allowed=playable(camera),url=allowed?camera.streamUrl!:'';
 useEffect(()=>{
  if(!allowed||camera.embedType!=='hls'||!video.current)return;
  const element=video.current;
  if(element.canPlayType('application/vnd.apple.mpegurl')){element.src=url;return;}
  if(!Hls.isSupported())return;
  const hls=new Hls();hls.loadSource(url);hls.attachMedia(element);
  hls.on(Hls.Events.ERROR,(_e,data)=>{if(data.fatal)setFailed(true);});return()=>hls.destroy();
 },[allowed,camera.embedType,url]);
 if(!allowed)return null;
 const youtube=camera.embedType==='youtube';
 const embedAllowed=!youtube||/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[a-zA-Z0-9_-]+(?:\?|$)/.test(url);
 return <div ref={root} className="lens-camera-tile">
  {failed?<p role="status">Feed unavailable; port conditions unknown.</p>:camera.embedType==='hls'?<video ref={video} muted controls playsInline onError={()=>setFailed(true)} style={{width:'100%'}}/>:
   camera.embedType==='iframe'||youtube?embedAllowed?<iframe title={camera.name} src={url} sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen" allowFullScreen style={{width:'100%',height:220}}/>:<p>Unverified embed format.</p>:
   /* Public source images are deliberately direct embeds, never proxied/re-streamed. */
   // eslint-disable-next-line @next/next/no-img-element
   <img alt={camera.name} src={url} onError={()=>setFailed(true)} style={{width:'100%'}}/>}
  <button onClick={()=>void root.current?.requestFullscreen().catch(()=>{})}>Fullscreen / zoom</button>
 </div>;
}
