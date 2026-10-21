'use client';
import { useRef,useState } from 'react';
import type { RoadEndpoint,RoadLeg } from '@/lib/route-intelligence/road';

function LocationPicker({label,onSelect}:{label:string;onSelect:(point:RoadEndpoint|null)=>void}){
 const [query,setQuery]=useState(''),[items,setItems]=useState<RoadEndpoint[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const revision=useRef(0);
 async function search(){
  const version=++revision.current;setBusy(true);setMessage('');
  try{
   const match=query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
   if(match){const lat=Number(match[1]),lon=Number(match[2]);if(Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Coordinates outside valid range.');setItems([{label:query.trim(),lat,lon}]);return;}
   const response=await fetch(`/api/route-lens/road?q=${encodeURIComponent(query)}`);const body=await response.json();
   if(version!==revision.current)return;
   if(!response.ok)throw new Error(body.error??'Location search failed.');
   setItems(body.locations);if(!body.locations.length)setMessage('No unambiguous candidate. Enter latitude,longitude or refine the address.');
  }catch(error){if(version===revision.current)setMessage(error instanceof Error?error.message:'Search failed.');}finally{if(version===revision.current)setBusy(false);}
 }
 return <fieldset><legend>{label}</legend><label>Address or latitude,longitude<input aria-label={`${label} address or coordinates`} value={query} onChange={e=>{revision.current++;setQuery(e.target.value);setItems([]);setBusy(false);onSelect(null);}}/></label>
  <button type="button" disabled={busy||query.trim().length<3} onClick={()=>void search()}>{busy?'Searching…':`Find ${label.toLowerCase()}`}</button>
  {items.map((item,index)=><label key={`${item.lat}:${item.lon}:${index}`}><input type="radio" name={label} onChange={()=>onSelect(item)}/>{item.label} ({item.lat.toFixed(5)}, {item.lon.toFixed(5)})</label>)}
  {message&&<p role="status">{message}</p>}
 </fieldset>;
}

export default function RoadLegEditor({shipmentId,legs,onSaved}:{shipmentId:string;legs:RoadLeg[];onSaved:()=>void}){
 const [side,setSide]=useState<'origin'|'destination'>('origin'),[depot,setDepot]=useState<RoadEndpoint|null>(null),[gate,setGate]=useState<RoadEndpoint|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [truck,setTruck]=useState({height:'4',width:'2.5',length:'16.5',weight:'32'});
 const [hazmat,setHazmat]=useState(false);
 async function save(){
  if(!depot||!gate)return;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/route-lens/road',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shipmentId,side,from:side==='origin'?depot:gate,to:side==='origin'?gate:depot,truck:{...Object.fromEntries(Object.entries(truck).map(([k,v])=>[k,Number(v)])),hazmat}})});
   const body=await response.json();if(!response.ok)throw new Error(body.error??'Road planning failed.');
   setMessage('Truck planning route saved. Confirm gate access, permits and cargo restrictions with the carrier.');onSaved();
  }catch(error){setMessage(error instanceof Error?error.message:'Road planning failed.');}finally{setBusy(false);}
 }
 return <details><summary>Depot and truck legs ({legs.length}/2)</summary>
  {legs.map(leg=><p key={leg.side}>{leg.side}: {leg.distanceKm.toFixed(1)} km · {leg.durationHours.toFixed(1)} h planning duration · {new Date(leg.checkedAt).toLocaleString()}. {leg.caveat}</p>)}
  <p>Select an actual public gate rather than a berth centroid. Address search uses the existing public geocoder; enter coordinates to avoid sending an address. Routing requires a configured Valhalla service and does not include live traffic or customs delay.</p>
  <label>Shipment end<select value={side} onChange={e=>{setSide(e.target.value as typeof side);setGate(null);}}><option value="origin">Origin: depot → gate</option><option value="destination">Destination: gate → depot</option></select></label>
  <LocationPicker label="Depot" onSelect={setDepot}/><LocationPicker key={side} label="Public port gate" onSelect={setGate}/>
  <fieldset><legend>Truck dimensions — confirm before routing</legend>{Object.entries(truck).map(([key,value])=><label key={key}>{key} ({key==='weight'?'metric tonnes':'metres'})<input type="number" min="0.1" step="0.1" aria-label={`Truck ${key}`} value={value} onChange={e=>setTruck(old=>({...old,[key]:e.target.value}))}/></label>)}</fieldset>
  <label><input type="checkbox" checked={hazmat} onChange={e=>setHazmat(e.target.checked)}/>Hazardous cargo (map restrictions only; confirm ADR class and permits separately)</label>
  <button type="button" disabled={busy||!depot||!gate} onClick={()=>void save()}>{busy?'Planning…':'Calculate and save truck leg'}</button>{message&&<p role="status">{message}</p>}
 </details>;
}
