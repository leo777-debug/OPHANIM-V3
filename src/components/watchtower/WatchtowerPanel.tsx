'use client';
import { useEffect,useState } from 'react';
import CameraTile from './CameraTile';
import CameraViewer from '@/components/CameraViewer';
import { playable,type CameraFeed } from '@/lib/watchtower/catalogue';
import type { ProviderMapLayer } from '@/lib/providers/types';
type Port={code:string;name:string;lat:number;lon:number;gap:string;cameras:Array<CameraFeed&{distanceKm:number}>};
export default function WatchtowerPanel({initialPort='',onLayers,onLocate}:{initialPort?:string;onLayers?:(layers:ProviderMapLayer[])=>void;onLocate?:(lat:number,lon:number,zoom?:number)=>void}){
 const [query,setQuery]=useState(initialPort),[ports,setPorts]=useState<Port[]>([]),[selected,setSelected]=useState<Port|null>(null),[camera,setCamera]=useState<CameraFeed|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();const timer=setTimeout(()=>{
   void fetch(`/api/watchtower?q=${encodeURIComponent(query)}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('Camera catalogue unavailable.');return r.json();}).then((data:{ports:Port[]})=>{setPorts(data.ports);setError('');onLayers?.([{id:'watchtower-search',provider:'watchtower',name:'Camera coverage ports',geometry:'point',visible:true,interactive:true,style:{color:'#f8bc59',radius:7},source:{type:'FeatureCollection',features:data.ports.map(p=>({type:'Feature',geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{id:p.code,name:p.name,port:p.code,lat:p.lat,lng:p.lon,why:p.gap,provider:'watchtower'}}))}}]);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  },250);return()=>{clearTimeout(timer);controller.abort();};
 },[query,onLayers]);
 return <section aria-label="Watchtower public cameras" className="lens-panel">
  <h2>Watchtower</h2><p>Public waterfront cameras. Empty or stale coverage never means all clear.</p>
  <label>Port or area<input aria-label="Search port cameras" value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);}} placeholder="Bandar Abbas, Fujairah anchorage…"/></label>
  {error&&<p role="alert">{error}</p>}
  <div className="lens-port-list">{ports.map(p=><button key={p.code} onClick={()=>{setSelected(p);onLocate?.(p.lat,p.lon,10);}}><strong>{p.name}</strong><span>{p.cameras.length} public feed{p.cameras.length===1?'':'s'}</span></button>)}</div>
  {!ports.length&&!error&&<p>No catalogue port matched. Coverage is unverified.</p>}
  {selected&&<><h3>{selected.name}</h3><p>{selected.gap}</p><div className="lens-camera-grid">{selected.cameras.map(c=><article key={c.id}>
   <strong>{c.name}</strong><p>{c.distanceKm.toFixed(1)} km from port · {c.status}</p>
   {playable(c)&&<CameraTile camera={c}/>}
   {playable(c)?<button onClick={()=>setCamera(c)}>Open public live tile / fullscreen</button>:<p>Playback unavailable or permission not verified.</p>}
   <p>Last online: {c.lastSeen?new Date(c.lastSeen).toLocaleString():'not verified'}</p><p>{c.coverage}</p>
   <a href={c.sourceUrl} target="_blank" rel="noreferrer">Publisher camera page</a><details><summary>Source terms</summary><p>{c.terms}</p><a href={c.termsUrl} target="_blank" rel="noreferrer">Terms/source</a></details>
  </article>)}</div></>}
  {camera&&<CameraViewer camera={{name:camera.name,lat:camera.lat,lng:camera.lon,stream_url:camera.streamUrl,stream_type:camera.embedType==='youtube'?'iframe':camera.embedType==='snapshot'?'jpg':camera.embedType,external_url:camera.sourceUrl}} onClose={()=>setCamera(null)}/>}
 </section>;
}
