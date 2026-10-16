'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { ATLAS_TOOLS, type AtlasTool } from '@/lib/atlas-tools';
import { feedIds, PRESENTATION_FEEDS, publicUrl } from '@/lib/presentation/feeds';
import type { FeedId, PresentationFeed } from '@/lib/presentation/types';
import IntelFeed from '@/components/IntelFeed';
import IntelligenceExplorer from '@/components/intelligence/IntelligenceExplorer';
import styles from './unified-map.module.css';

const AiAnalyst=dynamic(()=>import('@/components/AiAnalyst'));
const Fusion=dynamic(()=>import('@/components/ThreatFusionHUD'));
const Recon=dynamic(()=>import('@/components/OsintPanel'));
const Markets=dynamic(()=>import('@/components/MarketsPanel'));
const Alerts=dynamic(()=>import('@/components/LiveAlerts'));
const Entities=dynamic(()=>import('@/components/EntityGraphPanel'),{ssr:false});
const Watchlists=dynamic(()=>import('@/components/WatchlistPanel'));
type Entity={type:string;id:string;label?:string;properties?:Record<string,unknown>}|null;
export default function MapToolDock({tool,data,feeds,entity,replaying,onClose,onLocate,onSelect}:{
  tool:AtlasTool;data:Record<string,unknown>;feeds:Partial<Record<FeedId,PresentationFeed>>;entity:Entity;replaying:boolean;
  onClose:()=>void;onLocate:(lat:number,lng:number,zoom?:number)=>void;onSelect:(entity:Record<string,unknown>)=>void;
}) {
  const [newsView,setNewsView]=useState<'news'|'timeline'|'regions'|'clocks'>('news');
  const [target,setTarget]=useState('');
  const tracks=useMemo(()=>tool!=='tracking'?[]:['flights','maritime'].flatMap(id=>(feeds[id as FeedId]?.features??[]).map((feature):Record<string,unknown>=>({...feature.properties,provider:id}))).filter(item=>JSON.stringify([item.name,item.id,item.mmsi,item.imo,item.callsign]).toLowerCase().includes(target.toLowerCase())).slice(0,100),[feeds,target,tool]);
  return <aside className={styles.dock} aria-label="Map intelligence panel" data-testid="map-tool-dock">
    <header><strong>{ATLAS_TOOLS.find(item=>item.id===tool)?.label??'Intelligence'}</strong><button title="Close tool" aria-label="Close tool" onClick={onClose}><X size={17}/></button></header>
    <div className={styles.dockBody}>
      {(tool==='analyst'||tool==='settings')&&<AiAnalyst embedded key={tool} data={data} mode={tool==='settings'?'settings':'briefing'}/>}
      {tool==='fusion'&&(replaying?<p className={styles.empty}>Live fusion is unavailable in replay mode. Recorded observations remain available in Intel Desk and Sources.</p>:<Fusion onLocate={onLocate}/>)}
      {['recon','shodan','ip'].includes(tool)&&<Recon key={tool} initialTab={tool==='shodan'?'shodan':tool==='ip'?'ip':'scanner'} onScanGeolocate={(_target,result)=>{if(Number.isFinite(result.lat)&&Number.isFinite(result.lng))onLocate(result.lat,result.lng,8);}}/>}
      {tool==='markets'&&<Markets embedded data={data}/>}
      {tool==='alerts'&&<Alerts data={data} onLocate={onLocate}/>}
      {tool==='entities'&&<Entities embedded entity={entity} onClose={onClose}/>}
      {tool==='watchlists'&&<Watchlists embedded/>}
      {tool==='logistics'&&<div className={styles.tracking}><h3>Ports and chokepoints</h3><p>Reference locations are not congestion or closure assessments. Shipment workflows remain in Full platform.</p>{(['ports','chokepoints']as const).flatMap(id=>(feeds[id]?.features??[]).map(feature=>{const item={...feature.properties,provider:id} as Record<string,unknown>;return <button key={`${id}-${item.id}`} onClick={()=>{onSelect(item);if(typeof item.lat==='number'&&typeof item.lng==='number')onLocate(item.lat,item.lng,6);}}><MapPin size={15}/><span>{String(item.name??item.id)}<small>{id==='ports'?'Port reference':'Chokepoint reference'}</small></span></button>;}))}</div>}
      {tool==='news'&&<><div className={styles.dockTabs} role="tablist" aria-label="Intelligence views">{(['news','timeline','regions','clocks']as const).map(view=><button key={view} role="tab" aria-selected={newsView===view} onClick={()=>setNewsView(view)}>{view}</button>)}</div>{newsView==='news'?<IntelFeed compact data={data} onLocate={onLocate} variant="workbench"/>:<IntelligenceExplorer view={newsView} data={data} onLocate={onLocate}/>}</>}
      {tool==='sources'&&<ul className={styles.sourceList}>{feedIds.map(id=>{const feed=feeds[id];return <li key={id}><strong>{PRESENTATION_FEEDS[id].name}</strong><span>{feed?.state??'Connecting'}{id==='satellites'?' / calculated':''}</span><p>{feed?.note}</p><small>Observed: {feed?.observedAt??'Not supplied by source'}</small><small>Retrieved: {feed?.fetchedAt??'Waiting'}</small>{publicUrl(feed?.sourceUrl)&&<a href={publicUrl(feed?.sourceUrl)} target="_blank" rel="noopener noreferrer">Source</a>}</li>;})}</ul>}
      {tool==='tracking'&&<div className={styles.tracking}><input aria-label="Find vessel or aircraft" placeholder="Callsign, MMSI, IMO or vessel name" value={target} onChange={event=>setTarget(event.target.value)}/><p>{tracks.length===100?'Showing first 100 matches':`${tracks.length} loaded matches`}. Positions update at source cadence.</p>{tracks.map(item=><button key={`${item.provider}:${item.id}`} onClick={()=>onSelect(item)}><MapPin size={15}/><span><strong>{String(item.name??item.id)}</strong><small>{String(item.mmsi??item.icao24??item.imo??item.provider)}</small></span></button>)}{!tracks.length&&<p>No matching positions are currently loaded.</p>}</div>}
    </div>
  </aside>;
}
