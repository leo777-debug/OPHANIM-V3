'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Activity, Bell, Bookmark, Brain, Camera, CloudLightning, Database, Globe2, Layers3, MapPin, Moon, Network, Newspaper, Plane, Plus, Radar, RefreshCw, Satellite, Search, Settings, Share2, Shield, Ship, Sun, Upload, X, ChartNoAxesColumn } from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import FullscreenButton from '@/components/FullscreenButton';
import CommandPalette from '@/components/CommandPalette';
import { usePresentation } from '@/components/presentation/PresentationBoundary';
import { ATLAS_TOOLS, parseAtlasTool, type AtlasTool } from '@/lib/atlas-tools';
import { createMapWorkspace, type MapViewport } from '@/lib/map-workspaces';
import { defaultUnifiedMapState, patchUnifiedWorkspace, restoreUnifiedMapState, UNIFIED_MAP_STORAGE } from '@/lib/unified-map';
import { feedIds, PRESENTATION_FEEDS, publicUrl } from '@/lib/presentation/feeds';
import type { FeedId, PresentationSettings } from '@/lib/presentation/types';
import type { SearchAction } from '@/lib/providers/types';
import { requestJson } from '@/lib/logistics/client';
import type { ShipmentRecord } from '@/lib/logistics/shipments';
import type { DisruptionRecord } from '@/lib/logistics/disruptions';
import DetailDrawer from '@/components/logistics/DetailDrawer';
import ShipmentRoute from '@/components/logistics/ShipmentRoute';
import { useUnifiedMapFeeds } from './useUnifiedMapFeeds';
import MapToolDock from './MapToolDock';
import styles from './unified-map.module.css';

const Globe = dynamic(() => import('@/components/presentation/PresentationGlobe'), { ssr: false });
const toolIcons = { analyst:Brain, fusion:Activity, recon:Radar, markets:ChartNoAxesColumn, alerts:Bell, entities:Network, search:Search, shodan:Shield, ip:MapPin, tracking:Ship, news:Newspaper, settings:Settings, watchlists:Bookmark, sources:Database, logistics:Layers3 };
const layerIcons:Partial<Record<FeedId,typeof Globe2>> = { flights:Plane, maritime:Ship, cameras:Camera, news:Newspaper, satellites:Satellite, weather:CloudLightning, cyber:Shield, cables:Network };
const regions = [ ['Global',24,42,1.35], ['Gulf',25,53,4], ['Europe',52,14,3.1], ['Asia',30,100,2.35], ['Americas',15,-79,2.1], ['Africa',2,21,2.7], ['Oceania',-24,141,2.65] ] as const;
const groups = { All:feedIds, Transport:['flights','maritime','ports','chokepoints','cameras','cables'], Hazards:['earthquakes','fires','weather','incidents','space-weather'], Intelligence:['news','broadcasts','conflicts','war-sanctions','cyber','infrastructure','satellites'] };
const layerAliases:Record<string,FeedId> = { war_sanctions:'war-sanctions', global_incidents:'incidents', malware:'cyber', news_intel:'news', live_news:'broadcasts', cctv:'cameras', sdk_sea:'cables', conflict_zones:'conflicts' };
const timeText = (value:unknown) => typeof value==='string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC' : 'Not supplied by source';

export default function UnifiedMap({ publicSurface=false, settings: suppliedSettings }: { publicSurface?:boolean; settings?:PresentationSettings }) {
  const root=useRef<HTMLElement>(null);
  const searchRef=useRef<HTMLDivElement>(null);
  const pathname=usePathname(), query=useSearchParams();
  const presentation=usePresentation();
  const settings=suppliedSettings ?? presentation.settings;
  const [state,setState]=useState(defaultUnifiedMapState);
  const [restored,setRestored]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [layerSearch,setLayerSearch]=useState('');
  const [group,setGroup]=useState<keyof typeof groups>('All');
  const [layersOpen,setLayersOpen]=useState(false);
  const [dayNight,setDayNight]=useState(false);
  const [selected,setSelected]=useState<Record<string,unknown>|null>(null);
  const [follow,setFollow]=useState(false);
  const [locate,setLocate]=useState<{lat:number;lng:number;zoom?:number;sequence:number}|null>(null);
  const [clock,setClock]=useState('UTC');
  const [notice,setNotice]=useState('');
  const [marketData,setMarketData]=useState<Record<string,unknown>>({});
  const [shipment,setShipment]=useState<ShipmentRecord|null>(null);
  const [disruption,setDisruption]=useState<DisruptionRecord|null>(null);
  const tool=parseAtlasTool(query.get('tool'));
  const activeTool=tool==='search'?null:tool;
  const workspace=state.workspaces.find(item=>item.id===state.activeId) ?? state.workspaces[0];
  const stateRef=useRef(state);
  useEffect(()=>{ stateRef.current=state; },[state]);
  const {feeds,data:feedData,available,replay,loading}=useUnifiedMapFeeds(settings.revision,refresh);
  const hidden=useMemo(()=>new Set(feedIds.filter(id=>workspace.activeLayers[id]===false)),[workspace.activeLayers]);
  const data=useMemo(()=>({...feedData,...marketData}),[feedData,marketData]);

  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      let restoredState=defaultUnifiedMapState();
      try { restoredState=restoreUnifiedMapState(localStorage.getItem(UNIFIED_MAP_STORAGE)); } catch { /* Storage is optional. */ }
      const params=new URLSearchParams(location.search);
      if(params.has('layers')) {
        const enabled=new Set((params.get('layers')??'').split(',').map(id=>layerAliases[id]??id));
        restoredState=patchUnifiedWorkspace(restoredState,{activeLayers:Object.fromEntries(feedIds.map(id=>[id,enabled.has(id)]))});
      }
      const lat=Number(params.get('lat')),lng=Number(params.get('lng')??params.get('lon')),zoom=Number(params.get('zoom')??3);
      if(params.has('lat') && (params.has('lng')||params.has('lon')) && [lat,lng,zoom].every(Number.isFinite) && Math.abs(lat)<=85 && Math.abs(lng)<=180 && zoom>=0 && zoom<=22) restoredState=patchUnifiedWorkspace(restoredState,{viewport:{latitude:lat,longitude:lng,zoom}});
      setState(restoredState);setRestored(true);
    });
    return()=>cancelAnimationFrame(frame);
  },[]);
  useEffect(()=>{
    if(!restored)return;
    try{localStorage.setItem(UNIFIED_MAP_STORAGE,JSON.stringify(state));}catch{/* Storage is optional. */}
  },[state,restored]);
  useEffect(()=>{
    const tick=()=>setClock(new Date().toLocaleTimeString('en-GB',{timeZone:'UTC',hour12:false})+' UTC');
    const frame=requestAnimationFrame(tick),timer=setInterval(tick,1000);
    return()=>{cancelAnimationFrame(frame);clearInterval(timer);};
  },[]);
  const onViewport=useCallback((viewport:MapViewport)=>{
    const bounded={...viewport,longitude:((viewport.longitude+180)%360+360)%360-180};
    setState(current=>patchUnifiedWorkspace(current,{viewport:bounded}));
  },[]);
  const onLocate=useCallback((lat:number,lng:number,zoom=4)=>{
    if(![lat,lng,zoom].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lng)>180)return;
    setLocate({lat,lng,zoom,sequence:Date.now()});
  },[]);
  const onSelect=useCallback((entity:Record<string,unknown>)=>{setSelected(entity);setFollow(false);},[]);
  const openTool=useCallback((next:AtlasTool|null)=>{
    const params=new URLSearchParams(location.search);
    if(next)params.set('tool',next);else params.delete('tool');
    window.history.replaceState(null,'',pathname+(params.size?'?'+params.toString():''));
    if(next==='search')searchRef.current?.querySelector('input')?.focus();
  },[pathname]);
  useEffect(()=>{
    if(tool!=='search')return;
    const frame=requestAnimationFrame(()=>searchRef.current?.querySelector('input')?.focus());
    return()=>cancelAnimationFrame(frame);
  },[tool]);
  useEffect(()=>{
    if(activeTool!=='markets'||replay.length)return;
    const controller=new AbortController();
    void fetch('/api/markets',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])}).then(async response=>{if(!response.ok)return;const value=await response.json();if(!controller.signal.aborted&&value&&typeof value==='object'&&!Array.isArray(value))setMarketData({markets:value});}).catch(()=>{});
    return()=>controller.abort();
  },[activeTool,replay.length]);
  const shipmentId=query.get('shipment'), disruptionId=query.get('disruption');
  useEffect(()=>{
    if(publicSurface)return;
    let cancelled=false;
    if(shipmentId)void requestJson<{shipment:ShipmentRecord}>(`/api/logistics/shipments/${encodeURIComponent(shipmentId)}`).then(value=>{if(!cancelled)setShipment(value.shipment);}).catch(()=>{if(!cancelled)setNotice('Shipment unavailable. Sign in with access to this shipment.');});
    if(disruptionId)void requestJson<{disruption:DisruptionRecord}>(`/api/logistics/disruptions/${encodeURIComponent(disruptionId)}`).then(value=>{if(!cancelled)setDisruption(value.disruption);}).catch(()=>{if(!cancelled)setNotice('Disruption unavailable. Sign in with access to this record.');});
    return()=>{cancelled=true;};
  },[publicSurface,shipmentId,disruptionId]);
  useEffect(()=>{
    if(!follow||!selected)return;
    const feed=feeds[selected.provider as FeedId];
    const match=feed?.features.find(item=>item.properties?.id===selected.id)?.properties;
    if(match&&typeof match.lat==='number'&&typeof match.lng==='number')onLocate(match.lat,match.lng,Math.max(4,stateRef.current.workspaces.find(item=>item.id===stateRef.current.activeId)?.viewport.zoom??4));
  },[feeds,follow,selected,onLocate]);
  function onAction(action:SearchAction) {
    if(action.type==='enable_layers')setState(current=>patchUnifiedWorkspace(current,{activeLayers:{...current.workspaces.find(item=>item.id===current.activeId)!.activeLayers,...Object.fromEntries(action.layers.map(id=>[layerAliases[id]??id,true]))}}));
    else if(action.type==='unavailable')setNotice(action.message);
    else presentation.openPage(action.href);
  }
  function changeTab(id:string) {
    const next=state.workspaces.find(item=>item.id===id);if(!next)return;
    setState(current=>({...current,activeId:id}));setSelected(null);setFollow(false);
    onLocate(next.viewport.latitude,next.viewport.longitude,next.viewport.zoom);
  }
  function addTab() {
    if(state.workspaces.length>=12)return;
    const next=createMapWorkspace({...workspace,id:crypto.randomUUID(),label:`Globe ${state.workspaces.length+1}`});
    setState(current=>({...current,activeId:next.id,workspaces:[...current.workspaces,next]}));setSelected(null);setFollow(false);
  }
  async function share() {
    const params=new URLSearchParams({view:publicSurface?'map':'full',layers:feedIds.filter(id=>!hidden.has(id)).join(','),lat:String(workspace.viewport.latitude.toFixed(4)),lng:String(workspace.viewport.longitude.toFixed(4)),zoom:String(workspace.viewport.zoom.toFixed(2))});
    try {await navigator.clipboard.writeText(location.origin+(publicSurface?'/presentation':'/logistics/map')+'?'+params);setNotice('Map view link copied. Private records and credentials are not included.');} catch {setNotice('The browser blocked clipboard access.');}
  }
  const news=feeds.news?.news??[];
  const headlines=news.slice(0,12).map(item=>item.title);
  if(!headlines.length)headlines.push(loading?'Connecting public sources...':'No news items currently available.');
  const objectCount=Object.values(feeds).reduce((sum,feed)=>sum+feed.features.length,0);
  const rows=feedIds.filter(id=>groups[group].includes(id)&&`${PRESENTATION_FEEDS[id].name} ${PRESENTATION_FEEDS[id].source}`.toLowerCase().includes(layerSearch.toLowerCase()));
  const selectedFeed=feeds[selected?.provider as FeedId];
  const entity=useMemo(()=>selected?{type:String(selected.provider==='maritime'?'vessel':selected.provider==='flights'?'aircraft':selected.type??'event'),id:String(selected.id??selected.name??''),label:String(selected.name??selected.id??'Object'),properties:selected}:null,[selected]);
  return <main ref={root} className={`world-map-workspace ${styles.workspace} ${styles.stageWithTabs} ${publicSurface?styles.publicSurface:''}`} style={{containerType:'inline-size'}} data-testid="operational-map-workspace" data-unified-map="true" data-surface={publicSurface?'public':'platform'}>
    <header className={styles.header}>
      <div className={styles.title}><Globe2/><div><small>Operational map</small><h1>Global situation monitor</h1></div></div>
      <div className={styles.headerActions}><span>Ophanim live</span><time>{clock}</time><FullscreenButton targetRef={root} label="Fullscreen map"/><select aria-label="Map region" defaultValue="Global" onChange={event=>{const region=regions.find(item=>item[0]===event.target.value);if(region)onLocate(region[1],region[2],region[3]);}}>{regions.map(item=><option key={item[0]}>{item[0]}</option>)}</select><button title="Refresh feeds" aria-label="Refresh feeds" onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={16}/></button><button title="Share map view" aria-label="Share map view" onClick={()=>void share()}><Share2 size={16}/></button><button title="Show layers" aria-label="Show layers" aria-expanded={layersOpen} onClick={()=>setLayersOpen(value=>!value)}><Layers3 size={16}/></button></div>
    </header>
    <div className={styles.ribbon}><div ref={searchRef} className={styles.search}><SearchBar alwaysExpanded onLocate={onLocate} onAction={onAction}/></div><nav className={styles.tools} aria-label="Map tools">{ATLAS_TOOLS.map(item=>{const Icon=toolIcons[item.id];return <button key={item.id} title={item.label+' - '+item.description} aria-label={item.label} data-primary={item.id==='settings'||item.id==='news'} aria-pressed={activeTool===item.id} onClick={()=>openTool(activeTool===item.id?null:item.id)}><Icon size={17}/><span>{item.label}</span></button>;})}<button title="Import shipments" aria-label="Import shipments" onClick={()=>presentation.openPage('/imports')}><Upload size={17}/><span>Import</span></button></nav></div>
    <div className={styles.tabs} role="tablist" aria-label="Globe workspaces">{state.workspaces.map(item=><div className={styles.tab} key={item.id}><button role="tab" aria-selected={state.activeId===item.id} onClick={()=>changeTab(item.id)}><Globe2 size={13}/>{item.label}</button>{item.id!=='main'&&<button aria-label={`Close ${item.label}`} title={`Close ${item.label}`} onClick={()=>{if(state.activeId===item.id)changeTab('main');setState(current=>({...current,workspaces:current.workspaces.filter(tab=>tab.id!==item.id)}));}}><X size={12}/></button>}</div>)}<button title="New globe" aria-label="New globe" disabled={state.workspaces.length>=12} onClick={addTab}><Plus size={14}/>New globe</button></div>
    <section className={`${styles.stage} ${activeTool?styles.stageWithDock:''}`}>
      <aside className={`${styles.layers} ${layersOpen?styles.layersOpen:''}`} aria-label="Visible layers"><header><Layers3 size={17}/>Visible layers<b>{feedIds.length}</b></header><input className={styles.layerSearch} aria-label="Search layers" placeholder="Search layers" value={layerSearch} onChange={event=>setLayerSearch(event.target.value)}/><div className={styles.groups}>{(Object.keys(groups)as Array<keyof typeof groups>).map(name=><button key={name} aria-pressed={group===name} onClick={()=>setGroup(name)}>{name}</button>)}</div><div className={styles.layerList}>{rows.map(id=>{const definition=PRESENTATION_FEEDS[id],feed=feeds[id],Icon=layerIcons[id]??MapPin;const count=id==='news'?feed?.news.length:feed?.features.length;return <label className={styles.layer} key={id}><input type="checkbox" aria-label={definition.name} checked={!hidden.has(id)} disabled={!feed||feed.state==='unavailable'} onChange={()=>setState(current=>patchUnifiedWorkspace(current,{activeLayers:{...workspace.activeLayers,[id]:hidden.has(id)}}))}/><Icon size={17}/><span>{definition.name}<small>{feed?.state==='replay'?'Replay':definition.reference?'Reference':id==='satellites'?'Calculated positions':feed?.state??'Connecting'} / {definition.source}{feed?.state==='unavailable'?' - no data':''}{id==='space-weather'&&feed?.state!=='unavailable'?` / ${feed?.note??''}`:''}</small></span><b>{count===undefined?'...':count}</b></label>;})}</div></aside>
      <div className={styles.canvas} data-testid="unified-map-canvas">
        {restored&&<Globe feeds={feeds} hidden={hidden} onSelect={onSelect} locate={locate} projection={workspace.projection} mapStyle={workspace.mapStyle} dayNight={dayNight} embedded initialViewport={workspace.viewport} onViewportChange={onViewport}/>}
        <div className={styles.badge}><i/>{available}/{feedIds.length} feeds responding{replay.length>0&&<div className={styles.replay} data-testid="replay-label">Replay of live data recorded at {timeText(replay[0].recordedAt)}{replay.some(feed=>feed.testFixture)?' / Test replay fixture':''}</div>}</div>
        <div className={styles.appearance} role="group" aria-label="Map appearance">{([{id:'dark',name:'Night basemap',label:'Night',Icon:Moon},{id:'earth',name:'Earth colored basemap',label:'Earth',Icon:Globe2},{id:'satellite',name:'Satellite imagery',label:'Satellite',Icon:Satellite}]as const).map(({id,name,label,Icon})=><button key={id} title={name} aria-label={name} aria-pressed={workspace.mapStyle===id} onClick={()=>setState(current=>patchUnifiedWorkspace(current,{mapStyle:id}))}><Icon size={15}/><span>{label}</span></button>)}<button title="2D / 3D projection" aria-label="2D / 3D projection" aria-pressed={workspace.projection==='globe'} onClick={()=>setState(current=>patchUnifiedWorkspace(current,{projection:workspace.projection==='globe'?'mercator':'globe'}))}>{workspace.projection==='globe'?'3D':'2D'}</button><button title="Day and night overlay" aria-label="Day and night overlay" aria-pressed={dayNight} onClick={()=>setDayNight(value=>!value)}><Sun size={15}/></button></div>
        {selected&&<section className={styles.selection} role="region" aria-label="Object details"><button title="Close details" aria-label="Close details" onClick={()=>{setSelected(null);setFollow(false);}}><X size={17}/></button><h2>{String(selected.name??selected.id??'Map observation')}</h2><p>{String(selected.source??selectedFeed?.source??'Public source')}</p><dl>{Object.entries(selected).filter(([key,value])=>!['sourceUrl','source','name','provider'].includes(key)&&['string','number','boolean'].includes(typeof value)&&value!==null).slice(0,14).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{String(value)}</dd></div>)}</dl><p>Observed: {timeText(selected.observedAt)}</p><p>Retrieved: {timeText(selectedFeed?.fetchedAt)}</p>{publicUrl(selected.sourceUrl??selectedFeed?.sourceUrl)&&<p><a href={publicUrl(selected.sourceUrl??selectedFeed?.sourceUrl)} target="_blank" rel="noopener noreferrer">Open source</a></p>}<div className={styles.selectionActions}><button onClick={()=>openTool('entities')}>Entities</button>{['flights','maritime'].includes(String(selected.provider))&&<button aria-pressed={follow} onClick={()=>setFollow(value=>!value)}>{follow?'Stop following':'Follow updates'}</button>}</div></section>}
      </div>
      {activeTool&&<MapToolDock key={activeTool} tool={activeTool} data={replay.length?feedData:data} feeds={feeds} entity={entity} replaying={replay.length>0} onClose={()=>openTool(null)} onLocate={onLocate} onSelect={onSelect}/>}
    </section>
    <footer className={styles.footer}><span>{objectCount.toLocaleString('en-GB')} objects / {loading?'Connecting':replay.length?'Replay + reference':'Source updates'}{notice&&<button className={styles.iconButton} title={notice} aria-label="Dismiss notification" onClick={()=>setNotice('')}>{notice}<X size={12}/></button>}</span><div className={styles.ticker}><div data-testid="ticker-track">{[0,1].flatMap(copy=>headlines.map((title,index)=><span key={`${copy}-${index}`} aria-hidden={copy===1}>{title}</span>))}</div></div></footer>
    {!publicSurface&&(shipment||disruption)&&<DetailDrawer title={shipment?'Shipment route':'Disruption'} onClose={()=>{setShipment(null);setDisruption(null);}}>{shipment?<><ShipmentRoute origin={shipment.originPortName} destination={shipment.destinationPortName} transshipments={shipment.transshipmentPorts}/><p>Only recorded shipment route data is shown; coordinates are not inferred.</p></>:<p>{disruption?.description??'No recorded description.'}</p>}</DetailDrawer>}
    <CommandPalette commands={[
      ...ATLAS_TOOLS.map(item=>({id:`tool:${item.id}`,title:item.label,subtitle:item.description,group:'Tools',run:()=>openTool(item.id)})),
      ...regions.map(item=>({id:`region:${item[0]}`,title:item[0],group:'Regions',run:()=>onLocate(item[1],item[2],item[3])})),
      ...feedIds.map(id=>({id:`layer:${id}`,title:PRESENTATION_FEEDS[id].name,group:'Layers',badge:hidden.has(id)?'OFF':'ON',active:!hidden.has(id),keepOpen:true,run:()=>setState(current=>patchUnifiedWorkspace(current,{activeLayers:{...workspace.activeLayers,[id]:hidden.has(id)}}))})),
      {id:'new-globe',title:'New globe',group:'Map',run:addTab},
      {id:'share',title:'Share map view',group:'Map',run:()=>void share()},
    ]}/>
  </main>;
}
