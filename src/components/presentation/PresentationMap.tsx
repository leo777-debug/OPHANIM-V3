'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Activity, Cable, Camera, ChevronDown, ChevronUp, Clock3, CloudLightning, Flame, Globe2, Landmark, MapPin, MapPinned, Maximize, Moon, Newspaper, Plane, Radio, RefreshCw, Satellite, Shield, Ship, SunMoon, TriangleAlert, X } from 'lucide-react';
import IntelligenceExplorer from '@/components/intelligence/IntelligenceExplorer';
import { PRESENTATION_FEEDS, feedIds, publicUrl } from '@/lib/presentation/feeds';
import type { FeedId, PresentationFeed, PresentationSettings } from '@/lib/presentation/types';
import type { MapProjection, MapStyle } from '@/lib/map-workspaces';
import OphanimMark from './OphanimMark';
import { PresenterSwitch, usePresentation } from './PresentationBoundary';
import styles from './presentation.module.css';

const Globe = dynamic(() => import('./PresentationGlobe'), { ssr: false, loading: () => <div className={styles.globePoster} data-testid="globe-starter"><span>Starting interactive map...</span></div> });
const icons = { flights: Plane, maritime: Ship, ports: MapPin, chokepoints: Ship, cameras: Camera, broadcasts: Radio, conflicts: TriangleAlert, infrastructure: Landmark, 'war-sanctions': Shield, earthquakes: Activity, fires: Flame, weather: CloudLightning, satellites: Satellite, cables: Cable, incidents: Radio, cyber: Shield, news: Newspaper, 'space-weather': Satellite };
const when = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().replace('T',' ').slice(0,19) + ' UTC' : 'Observation time not supplied';

export default function PresentationMap({ settings: initial, preview = false }: { settings: PresentationSettings; preview?: boolean }) {
  const controls = usePresentation();
  const settings = controls.settings.updatedAt ? controls.settings : initial;
  const [feeds, setFeeds] = useState<Partial<Record<FeedId,PresentationFeed>>>({});
  const [hidden, setHidden] = useState<Set<FeedId>>(new Set());
  const [selected, setSelected] = useState<Record<string,unknown> | null>(null);
  const [locate, setLocate] = useState<{lat:number;lng:number;sequence:number} | null>(null);
  const [clock, setClock] = useState('--:--:--');
  const [refresh, setRefresh] = useState(0);
  const [rightOpen, setRightOpen] = useState(true);
  const [projection, setProjection] = useState<MapProjection>('globe');
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
  const [dayNight, setDayNight] = useState(false);
  useEffect(() => {
    const update = () => setClock(new Date().toISOString().slice(11,19));
    update(); const timer = setInterval(update,1000); return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      for (const id of feedIds) void (async () => {
        try {
          const response = await fetch(`/api/presentation/feed/${id}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]) });
          if (!response.ok) throw new Error('Feed unavailable');
          const {feed:data}: {feed:PresentationFeed} = await response.json();
          if (!data || data.id !== id || !Array.isArray(data.features) || !Array.isArray(data.news) || !Array.isArray(data.sources)) throw new Error('Invalid public feed');
          if (!controller.signal.aborted) setFeeds(current => ({...current,[id]:data}));
        } catch {
          if (!controller.signal.aborted) setFeeds(current => ({...current,[id]: {...(current[id] ?? { id,features:[],news:[],sources:[],source:PRESENTATION_FEEDS[id].source,sourceUrl:PRESENTATION_FEEDS[id].url,fetchedAt:new Date().toISOString(),observedAt:null,reference:false,recordedAt:null }),state:'unavailable',note:'Source could not be refreshed. No current data.'}}));
        }
      })();
    };
    load(); const timer = setInterval(() => { if (!document.hidden) load(); },60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [settings.replay, refresh]);
  const loaded = Object.values(feeds);
  const available = loaded.filter(feed => feed.state !== 'unavailable');
  const replays = available.filter(feed => feed.state === 'replay');
  const health = replays.length && replays.length === available.length ? 'replay' : loaded.some(feed => feed.state === 'unavailable') || replays.length ? 'partial' : available.length ? 'live' : 'waiting';
  const news = feeds.news?.state !== 'unavailable' ? feeds.news?.news ?? [] : [];
  const onLocate = useCallback((lat:number,lng:number) => setLocate(current => ({lat,lng,sequence:(current?.sequence ?? 0)+1})),[]);
  const onSelect = useCallback((entity:Record<string,unknown>) => setSelected(entity),[]);
  const earthquakeTimeline = (feeds.earthquakes?.state === 'unavailable' ? [] : feeds.earthquakes?.features ?? []).flatMap(feature => {
    const p=feature.properties ?? {}, time=typeof p.observedAt === 'string' ? Date.parse(p.observedAt) : NaN;
    return Number.isFinite(time) ? [{id:String(p.id),place:String(p.name),magnitude:Number(p.magnitude ?? 0),time,url:publicUrl(p.sourceUrl),lat:Number(p.lat),lng:Number(p.lng)}] : [];
  });
  const ticker = [...(feeds.earthquakes?.state === 'unavailable' ? [] : feeds.earthquakes?.features ?? []).slice(0,12).map(feature => `M${feature.properties?.magnitude ?? '?'} ${feature.properties?.name ?? 'Earthquake'}`),...news.slice(0,12).map(item => `${item.source}: ${item.title}`)];
  const replayTimes = replays.map(feed => feed.recordedAt).filter((value):value is string => Boolean(value)).sort();
  const fixture = replays.some(feed => feed.testFixture);
  return <main className={styles.dashboard} data-testid="presentation-map" data-health={health}>
    <Globe feeds={feeds} hidden={hidden} onSelect={onSelect} locate={locate} projection={projection} mapStyle={mapStyle} dayNight={dayNight} />
    <header className={styles.topbar}>
      <div className={styles.brand}><OphanimMark /><div><strong>OPHANIM</strong><span>Live global intelligence</span></div></div>
      <div className={styles.metrics} aria-label="Live object counts"><span><Plane size={15} />{feeds.flights?.state === 'unavailable' ? '--' : feeds.flights?.features.length.toLocaleString() ?? '--'} <small>aircraft</small></span><span><Ship size={15} />{feeds.maritime?.state === 'unavailable' ? '--' : feeds.maritime?.features.length.toLocaleString() ?? '--'} <small>vessels</small></span><span><Radio size={15} />{available.filter(feed => !feed.reference && !['flights','maritime','cables','satellites','news','cameras'].includes(feed.id)).reduce((sum,feed) => sum+feed.features.length,0)} <small>events</small></span></div>
      <div className={styles.headerTools}><time aria-label="UTC clock">{clock} <small>UTC</small></time><span className={styles.health}><i data-health={health} />{health === 'live' ? 'Live' : health === 'replay' ? 'Replay' : health === 'partial' ? 'Partial feeds' : 'Connecting'}</span><button title="Fullscreen" aria-label="Fullscreen" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }}><Maximize size={18} /></button><PresenterSwitch view="map" /></div>
    </header>
    {preview && <div className={styles.preview}>Owner preview <Link href="/admin/presentation">Back to settings</Link></div>}
    <aside className={styles.layers} aria-label="Map layers"><div className={styles.panelTitle}><span>MAP LAYERS</span><button aria-label="Refresh feeds" title="Refresh feeds" onClick={() => setRefresh(value=>value+1)}><RefreshCw size={15} /></button></div>
      {feedIds.filter(id=>id!=='space-weather').map(id => { const feed=feeds[id], Icon=icons[id], unavailable=!feed || feed.state==='unavailable', count=feed?.features.length ?? 0; return <label key={id} className={styles.layer} title={feed?.note || (feed?'':'Connecting to source')}><input type="checkbox" disabled={unavailable || !count} checked={!unavailable && count>0 && !hidden.has(id)} onChange={() => setHidden(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;})} /><Icon size={19} /><span>{PRESENTATION_FEEDS[id].name}<small>{!feed?'Connecting':feed.state==='unavailable'?'Unavailable':feed.state === 'replay' ? 'Replay' : feed.reference ? 'Reference' : id === 'satellites' ? 'Calculated' : !count ? 'No observations' : 'Current feed'}</small></span><b>{unavailable?'--':count.toLocaleString()}</b></label>; })}
      {!available.some(feed=>feed.features.length) && <p className={styles.empty}>No map observations received yet. The globe remains available.</p>}
      {feeds['space-weather']?.note && <div className={styles.spaceWeather}><Satellite size={17} /><span>{feeds['space-weather'].note}</span></div>}
      <p className={styles.layerFoot}>Public sources only. Coverage varies by provider.</p>
      {settings.verifyButton && <Link className={styles.verify} href="/verify">Is this true?</Link>}
    </aside>
    <div className={styles.mapControls} role="group" aria-label="Map appearance">
      <button type="button" title={projection === 'globe' ? 'Switch to 2D map' : 'Switch to 3D globe'} aria-label={projection === 'globe' ? 'Switch to 2D map' : 'Switch to 3D globe'} aria-pressed={projection === 'globe'} onClick={() => setProjection(value => value === 'globe' ? 'mercator' : 'globe')}>{projection === 'globe' ? <Globe2 size={18} /> : <MapPinned size={18} />}</button>
      <div role="group" aria-label="Basemap style">
        <button title="Night basemap" aria-label="Night basemap" aria-pressed={mapStyle === 'dark'} onClick={() => setMapStyle('dark')}><Moon size={16} /><span>NIGHT</span></button>
        <button title="Earth colored basemap" aria-label="Earth colored basemap" aria-pressed={mapStyle === 'earth'} onClick={() => setMapStyle('earth')}><Globe2 size={16} /><span>EARTH</span></button>
        <button title="Satellite imagery" aria-label="Satellite imagery" aria-pressed={mapStyle === 'satellite'} onClick={() => setMapStyle('satellite')}><Satellite size={16} /><span>SAT</span></button>
      </div>
      <button type="button" title="Day/night overlay" aria-label="Day/night overlay" aria-pressed={dayNight} onClick={()=>setDayNight(value=>!value)}><SunMoon size={16} /></button>
    </div>
    <aside className={`${styles.intel} ${!rightOpen ? styles.intelClosed : ''}`} aria-label="Intelligence Desk"><div className={styles.panelTitle}><span>INTELLIGENCE DESK</span><button aria-label={rightOpen ? 'Collapse intelligence' : 'Expand intelligence'} onClick={()=>setRightOpen(value=>!value)}>{rightOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button></div>
      {rightOpen && <div className={styles.intelScroll}>
        <section className={styles.section}><h2><Newspaper size={16} />News<span>{news.length}</span></h2><div className={styles.newsList}>
          {!news.length && <p className={styles.empty}>{feeds.news?.state === 'unavailable' ? 'News source unavailable. No snapshot was received.' : 'No news received in this feed window.'}</p>}
          {news.slice(0,30).map(item=><article key={item.id} className={styles.newsItem}><div><span>{item.source}</span><time>{when(item.published)}</time></div>{publicUrl(item.link) ? <a href={publicUrl(item.link)} target="_blank" rel="noopener noreferrer">{item.title}</a> : <strong>{item.title}</strong>}</article>)}
        </div></section>
        <section className={`${styles.section} ${styles.explorer}`}><h2><Activity size={16} />Timeline</h2><IntelligenceExplorer view="timeline" data={{news,earthquakes:earthquakeTimeline}} onLocate={onLocate} /></section>
        <section className={`${styles.section} ${styles.explorer}`}><h2><Globe2 size={16} />Regions</h2><IntelligenceExplorer view="regions" data={{news}} onLocate={onLocate} /></section>
        <section className={styles.section}><h2><Radio size={16} />Sources & freshness</h2><ul className={styles.sourceList}>{feedIds.map(id=><li key={id}><span>{PRESENTATION_FEEDS[id].name}<small>{feeds[id]?.state ?? 'Connecting'}{feeds[id]?.state === 'replay' ? ' / recorded' : ''}</small></span><time>{feeds[id] ? when(feeds[id]?.state === 'replay' ? feeds[id]?.recordedAt : feeds[id]?.observedAt) : 'Waiting for source'}</time></li>)}</ul></section>
        <section className={`${styles.section} ${styles.clocks}`}><h2><Clock3 size={16} />World clocks</h2><IntelligenceExplorer view="clocks" data={{}} onLocate={onLocate} /></section>
      </div>}
    </aside>
    {replays.length > 0 && <div className={styles.replay} role="status" data-testid="replay-label">{fixture ? 'Test replay fixture' : 'Replay of public feed data'} recorded at {when(replayTimes[0])}{replayTimes.at(-1) !== replayTimes[0] ? ` to ${when(replayTimes.at(-1))}` : ''}{replays.length < available.length ? ' / mixed with live and reference feeds' : ''}</div>}
    {selected && <section className={styles.detail} aria-label="Object details"><button className={styles.close} aria-label="Close details" onClick={()=>setSelected(null)}><X size={18} /></button><small>{String(selected.provider ?? selected.type ?? 'Map object')}</small><h2>{String(selected.name ?? 'Selected object')}</h2><p>{selected.reference?'Reference location, not live telemetry':when(selected.observedAt)}</p>{selected.approximate_location===true && <p>Approximate story location, not verified incident coordinates.</p>}<dl>{['mmsi','imo','registration','icao24','model','magnitude','speed','speed_knots','heading','destination','lat','lng'].map(key=>selected[key] !== undefined && selected[key] !== null ? <div key={key}><dt>{key}</dt><dd>{String(selected[key])}</dd></div> : null)}</dl><p>Source: {publicUrl(selected.sourceUrl) ? <a href={publicUrl(selected.sourceUrl)} target="_blank" rel="noopener noreferrer">{String(selected.source ?? 'Public source')}</a> : String(selected.source ?? 'Public source')}</p></section>}
    <footer className={styles.ticker}><span>{replays.length ? 'REPLAY / FEEDS' : 'LIVE / FEEDS'}</span><div className={styles.tickerWindow}><div className={styles.tickerTrack} data-testid="ticker-track">{[0,1].map(copy=><div key={copy} aria-hidden={copy===1}>{(ticker.length ? ticker : ['No events received in the current feed window.']).map((text,index)=><span key={index}>{text}</span>)}</div>)}</div></div></footer>
  </main>;
}
