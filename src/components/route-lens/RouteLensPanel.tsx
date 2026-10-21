'use client';
import { useEffect,useState } from 'react';
import type { RouteLens,LensEvidence,LensLayer } from '@/lib/route-intelligence/lens';
import { LENS_LAYERS } from '@/lib/route-intelligence/lens-types';
import type { ProviderMapLayer } from '@/lib/providers/types';
import ForecastCard from '@/components/forecast/ForecastCard';
export default function RouteLensPanel({shipmentId,onLayers,onLocate}:{shipmentId?:string|null;onLayers:(layers:ProviderMapLayer[])=>void;onLocate:(lat:number,lon:number,zoom?:number)=>void}){
 const [id,setId]=useState(shipmentId??''),[lens,setLens]=useState<RouteLens|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<LensEvidence|null>(null),[hidden,setHidden]=useState<Set<LensLayer>>(new Set());
 useEffect(()=>{if(!id){onLayers([]);return;}const controller=new AbortController();
  const load=()=>void fetch(`/api/route-lens?shipment=${encodeURIComponent(id)}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error??'Route unavailable.');setLens(b);setError('');}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLens(null);}});
  load();const interval=setInterval(load,60000);return()=>{controller.abort();clearInterval(interval);};
 },[id,onLayers]);
 useEffect(()=>{onLayers(lens?.layers.map(l=>({...l,visible:!hidden.has(l.id.replace('route-lens-','') as LensLayer)}))??[]);},[lens,hidden,onLayers]);
 function select(e:LensEvidence){setSelected(e);if(e.lat!==undefined&&e.lon!==undefined)onLocate(e.lat,e.lon,8);}
 return <section className="lens-panel" aria-label="Route Lens"><h2>Route Lens</h2><p>Follow the evidence along a shipment corridor.</p>
  <label>Shipment ID<input aria-label="Route Lens shipment ID" value={id} onChange={e=>{setId(e.target.value);setLens(null);}} placeholder="Open from a shipment, or enter its UUID"/></label>
  {error&&<p role="alert">{error}</p>}{!id&&<p>Open a booked shipment to draw its route.</p>}
  {lens&&<><h3>{lens.label}</h3><p>Silence Clock: {lens.silenceClock.hours.toFixed(1)} h since last recorded fact ({lens.silenceClock.source}). Normal-gap baseline is not established.</p><p>{lens.ports.map(p=>p.name).join(' → ')}</p><button onClick={()=>{const p=lens.ports[0];if(p)onLocate(p.lat,p.lon,4);}}>Centre route</button>
   <div className="lens-toggles">{LENS_LAYERS.map(layer=><label key={layer}><input type="checkbox" checked={!hidden.has(layer)} onChange={()=>setHidden(old=>{const next=new Set(old);if(next.has(layer))next.delete(layer);else next.add(layer);return next;})}/>{layer.replaceAll('_',' ')} ({lens.counts[layer]})</label>)}</div>
   <div className="lens-evidence">{lens.evidence.filter(e=>!hidden.has(e.layer)).map(e=><button key={e.id} onClick={()=>select(e)}>{e.title}<small>{e.layer} · {e.confidence}</small></button>)}</div>
   {selected&&<article aria-label="Why this is here"><h4>{selected.title}</h4><p>{selected.why}</p><p>{selected.confidence} · {selected.observedAt??'Observation time unknown'}</p>{selected.sourceUrl&&<a href={selected.sourceUrl} target="_blank" rel="noreferrer">Normalized source evidence</a>}{selected.layer==='deep_watch'&&<a href="/operations">Review / mark false positive</a>}</article>}
   <details><summary>Coverage gaps ({lens.gaps.length})</summary>{lens.gaps.map(g=><p key={g}>{g}</p>)}</details><details><summary>Route assumptions</summary>{lens.assumptions.map(a=><p key={a}>{a}</p>)}</details>
   <ForecastCard shipmentId={lens.shipmentId} onEvidence={id=>{const e=lens.evidence.find(e=>e.id.includes(id));if(e)select(e);}}/>
  </>}
 </section>;
}
