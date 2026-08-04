'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, BarChart3, Newspaper, Search, X, Globe, MapPinned, Radar, Satellite, Moon, ExternalLink, AlertTriangle, Activity, Database, Wifi, Play, Network, Crosshair, Brain, Bookmark, Settings, FileUp } from 'lucide-react';
import IntelFeed from '@/components/IntelFeed';
import MarketsPanel from '@/components/MarketsPanel';
import ScmPanel from '@/components/ScmPanel';
import SearchBar from '@/components/SearchBar';
import ScaleBar from '@/components/ScaleBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import SharePanel from '@/components/SharePanel';
import ViewPresets from '@/components/ViewPresets';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import GlobalStatusBar from '@/components/GlobalStatusBar';
import LiveAlerts from '@/components/LiveAlerts';
import CommandPalette, { type PaletteCommand } from '@/components/CommandPalette';
import ThreatFusionHUD from '@/components/ThreatFusionHUD';
import WatchlistPanel from '@/components/WatchlistPanel';
import ProviderStatusPanel from '@/components/ProviderStatusPanel';
import type { ProviderMapLayer } from '@/lib/providers';

const OphanimMap = dynamic(() => import('@/components/OphanimMap'), { ssr: false });
const LayerPanel = dynamic(() => import('@/components/LayerPanel'));
const CameraViewer = dynamic(() => import('@/components/CameraViewer'));
const OsintPanel = dynamic(() => import('@/components/OsintPanel'));
const EntityGraphPanel = dynamic(() => import('@/components/EntityGraphPanel'));
const AiAnalyst = dynamic(() => import('@/components/AiAnalyst'));
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Mobile if narrow, OR landscape phone (short height + moderate width)
      setIsMobile(w < 768 || (h < 500 && w < 1024));
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isMobile;
}
const UptimeClock = () => {
  const [uptime, setUptime] = useState('00:00:00');
  const startTime = useRef<number | null>(null);
  useEffect(() => {
    startTime.current = Date.now();
    const iv = setInterval(() => {
      const e = Math.floor((Date.now() - (startTime.current ?? Date.now())) / 1000);
      setUptime(`${String(Math.floor(e/3600)).padStart(2,'0')}:${String(Math.floor((e%3600)/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="hidden lg:inline">UPTIME: <span className="text-[var(--gold-primary)]">{uptime}</span></span>;
};

const ZuluClock = () => {
  const [time, setTime] = useState('');
  useEffect(() => {
    const iv = setInterval(() => {
      const now = new Date();
      setTime(`ZULU ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}:${String(now.getUTCSeconds()).padStart(2,'0')}Z`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="text-[var(--cyan-primary)] font-bold tabular-nums">{time || 'ZULU --:--:--Z'}</span>;
};

/** Real entity count — no fake throughput metrics */
const ActiveEntityCount = ({ data }: { data: Record<string, unknown[]> }) => {
  const count = useMemo(() => {
    if (!data) return 0;
    return Object.values(data).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
  }, [data]);
  return <span className="text-[var(--alert-green)] font-bold tabular-nums">{count.toLocaleString()}</span>;
};

const OphanimMark = ({ className = '', animated = false }: { className?: string; animated?: boolean }) => (
  <svg
    viewBox="0 0 120 120"
    className={className}
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="ophanimMarkStroke" x1="18" y1="18" x2="102" y2="102">
        <stop stopColor="var(--logo-primary)" />
        <stop offset="0.55" stopColor="var(--logo-secondary)" />
        <stop offset="1" stopColor="var(--logo-core)" />
      </linearGradient>
      <radialGradient id="ophanimMarkCore" cx="50%" cy="50%" r="50%">
        <stop stopColor="var(--logo-core)" stopOpacity="0.85" />
        <stop offset="0.55" stopColor="var(--logo-primary)" stopOpacity="0.26" />
        <stop offset="1" stopColor="transparent" />
      </radialGradient>
    </defs>
    <g className={animated ? 'origin-center animate-[ophanim-rotate_22s_linear_infinite]' : ''}>
      <circle cx="60" cy="60" r="50" stroke="url(#ophanimMarkStroke)" strokeWidth="2.2" opacity="0.9" />
      <circle cx="60" cy="60" r="35" stroke="url(#ophanimMarkStroke)" strokeWidth="1.4" opacity="0.62" />
      <circle cx="60" cy="60" r="20" stroke="url(#ophanimMarkStroke)" strokeWidth="1" opacity="0.5" />
      {[0, 30, 60, 90, 120, 150].map((deg) => (
        <line
          key={deg}
          x1="60"
          y1="10"
          x2="60"
          y2="110"
          stroke="url(#ophanimMarkStroke)"
          strokeWidth="0.8"
          opacity="0.36"
          transform={`rotate(${deg} 60 60)`}
        />
      ))}
    </g>
    <g>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x = 60 + Math.cos(rad) * 35;
        const y = 60 + Math.sin(rad) * 35;
        return <circle key={deg} cx={x} cy={y} r="3.1" fill="var(--bg-void)" stroke="var(--logo-primary)" strokeWidth="1.2" />;
      })}
    </g>
    <circle cx="60" cy="60" r="14" fill="url(#ophanimMarkCore)" />
    <path d="M44 60c6-9 26-9 32 0-6 9-26 9-32 0Z" stroke="var(--text-heading)" strokeWidth="1.5" opacity="0.88" />
    <circle cx="60" cy="60" r="4.4" fill="var(--logo-core)" />
  </svg>
);

/** Extracts a watchable YouTube URL from embed/channel URLs */
function getYouTubeWatchUrl(url: string): string {
  if (url.includes('channel=')) return `https://www.youtube.com/channel/${url.split('channel=')[1].split('&')[0]}/live`;
  if (url.includes('/embed/')) return `https://www.youtube.com/watch?v=${url.split('/embed/')[1].split('?')[0]}`;
  return url;
}

export default function Dashboard() {
  const dataRef = useRef<any>({});
  const [dataVersion, setDataVersion] = useState(0);
  const data = dataRef.current;

  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [mapView, setMapView] = useState({ zoom: 2.5, latitude: 20 });
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lng: number; zoom?: number; ts: number } | null>(null);
  const [globalStats, setGlobalStats] = useState<any>(null);

  const mouseCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const coordsDisplayRef = useRef<HTMLDivElement>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [regionDossier, setRegionDossier] = useState<any>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [activeCamera, setActiveCamera] = useState<any>(null);
  const [spaceWeather, setSpaceWeather] = useState<any>(null);
  const [showLayers, setShowLayers] = useState(true);
  const [showMarkets, setShowMarkets] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showScmPanel, setShowScmPanel] = useState(true);
  const [showIntel, setShowIntel] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [showEntityGraph, setShowEntityGraph] = useState(false);
  const [showDesktopSearch, setShowDesktopSearch] = useState(false);
  const [showFusion, setShowFusion] = useState(false);
  const [showAiAnalyst, setShowAiAnalyst] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const [aiPanelMode, setAiPanelMode] = useState<'briefing' | 'settings'>('briefing');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'layers'|'markets'|'intel'|'search'|'recon'|null>(null);
  const [mapProjection, setMapProjection] = useState<'globe'|'mercator'>('globe');
  const [mapStyle, setMapStyle] = useState<'dark'|'satellite'>('dark');
  const [sweepData, setSweepData] = useState<any>(null);
  const [scanTargets, setScanTargets] = useState<any[]>([]);
  const [entityGraphTarget, setEntityGraphTarget] = useState<{ type: string; id: string; label?: string; properties?: Record<string, any> } | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [ophanimTheme, setOphanimTheme] = useState<'core'|'ghost'>('core');
  const [providerLayers, setProviderLayers] = useState<ProviderMapLayer[]>([]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const lat = Number(query.get('lat'));
    const lng = Number(query.get('lng'));
    const zoom = Number(query.get('zoom'));
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      setFlyToLocation({ lat, lng, zoom: Number.isFinite(zoom) ? zoom : 8, ts: Date.now() });
      setMapView((current) => ({ ...current, zoom: Number.isFinite(zoom) ? zoom : 8 }));
    }
  }, []);

  useEffect(() => {
    document.body.className = ophanimTheme === 'core' ? '' : `theme-${ophanimTheme}`;
  }, [ophanimTheme]);

  const isMobile = useIsMobile();
  const geocodeCache = useRef<Map<string, string>>(new Map());
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGeocodedPos = useRef<{ lat: number; lng: number } | null>(null);

  // ── DEFAULT: Most layers OFF — fast initial load ──
  const [activeLayers, setActiveLayers] = useState({
    flights: false,
    private: false,
    jets: false,
    military: false,
    maritime: true,
    ship_cargo: true,
    ship_tanker: true,
    ship_passenger: true,
    ship_fishing: true,
    ship_military: true,
    satellites: false,
    sat_comms: false,
    sat_military: false,
    sat_navigation: false,
    sat_earth: false,
    sat_science: false,
    balloons: false,
    cctv: true,
    live_news: true,
    news_intel: true,
    earthquakes: true,
    fires: false,
    weather: false,
    radiation: false,
    infrastructure: false,
    global_incidents: true,
    war_alerts: false,
    gps_jamming: false,
    day_night: true,
    cables: true,
    war_sanctions: true,
    sdk_sea: true,
    sdk_air: true,
    sdk_naval: true,
    terrain_3d: false,
    malware: false,
  });

  useEffect(() => {
    const providers = [
      activeLayers.maritime && 'maritime-map',
      activeLayers.cables && 'submarine-cables',
      activeLayers.infrastructure && 'infrastructure-map',
      activeLayers.war_sanctions && 'war-sanctions',
    ].filter((provider): provider is string => Boolean(provider));

    if (providers.length === 0) {
      setProviderLayers([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/map/layers?providers=${providers.join(',')}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;

        const data: unknown = await response.json();
        if (!cancelled && typeof data === 'object' && data !== null && Array.isArray((data as { layers?: unknown }).layers)) {
          setProviderLayers((data as { layers: ProviderMapLayer[] }).layers);
        }
      } catch {
        // Provider layers are optional; retain the last successful map state.
      }
    };

    void load();
    const refresh = setInterval(load, activeLayers.maritime ? 60_000 : 5 * 60_000);
    return () => { cancelled = true; clearInterval(refresh); };
  }, [activeLayers.maritime, activeLayers.cables, activeLayers.infrastructure, activeLayers.war_sanctions]);
  const [liveFeedUrl, setLiveFeedUrl] = useState<string | null>(null);
  const [liveFeedName, setLiveFeedName] = useState('');
  const [liveFeedEmbedAllowed, setLiveFeedEmbedAllowed] = useState(true);

  // Splash screen
  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(splashTimer);
  }, []);

  // On mount: geolocate by IP and fly to user's city (after splash/map init)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Restore active layers from URL if present
    const p = new URLSearchParams(window.location.search);
    const layers = p.get('layers');
    if (layers) {
      const active = layers.split(',');
      setActiveLayers(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { (next as any)[k] = active.includes(k); });
        return next;
      });
    }

    // Delay geolocation until map is ready (after splash screen clears)
    const geoTimer = setTimeout(() => {
      fetch('/api/geo')
        .then(r => r.json())
        .then(geo => {
          if (geo.status === 'success' && geo.lat && geo.lon) {
            setFlyToLocation({ lat: geo.lat, lng: geo.lon, ts: Date.now() });
            setMapView(v => ({ ...v, zoom: 12 }));
          }
        })
        .catch(() => { /* silent — keep default global view */ });
    }, 3000);

    return () => clearTimeout(geoTimer);
  }, []);

  // URL state: persist active layers only (lat/lon comes from IP geolocation on each load)
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      const active = Object.entries(activeLayers).filter(([,v]) => v).map(([k]) => k).join(',');
      const url = `${window.location.pathname}?layers=${active}`;
      window.history.replaceState(null, '', url);
    }, 1500);
  }, [activeLayers]);

  // Global Stats Fetch
  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(d => {
        if (d.stats) setGlobalStats(d.stats);
      })
      .catch(console.error);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as Element)?.tagName)) return;
      if (e.key === 'f' && !e.ctrlKey) {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      }
      if (e.key === 'l') setShowLayers(p => !p);
      if (e.key === 'm') setShowMarkets(p => !p);
      if (e.key === 'c') setShowScmPanel(p => !p);
      if (e.key === 'i') setShowIntel(p => !p);
      if (e.key === 's') { setShowDesktopSearch(p => !p); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); }
      if (e.key === 'r') setFlyToLocation({ lat: 20, lng: 0, ts: Date.now() });
      if (e.key === 'g') setMapProjection(p => p === 'globe' ? 'mercator' : 'globe');
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowDesktopSearch(true); setShowIntel(false); setShowMarkets(false); setShowAlerts(false);
      }
    };
    const fsHandler = () => setIsFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', handler);
    document.addEventListener('fullscreenchange', fsHandler);
    return () => { window.removeEventListener('keydown', handler); document.removeEventListener('fullscreenchange', fsHandler); };
  }, []);

  // Mouse coords + reverse geocode (Zero-Render)
  const handleMouseCoords = useCallback((coords: { lat: number; lng: number }) => {
    mouseCoordsRef.current = coords;
    if (coordsDisplayRef.current) {
      coordsDisplayRef.current.innerText = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    }
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      if (lastGeocodedPos.current) {
        const d = Math.abs(coords.lat - lastGeocodedPos.current.lat) + Math.abs(coords.lng - lastGeocodedPos.current.lng);
        if (d < 0.5) return; // increased threshold — fewer geocode calls
      }
      const gk = `${coords.lat.toFixed(1)},${coords.lng.toFixed(1)}`; // coarser grid = more cache hits
      if (geocodeCache.current.has(gk)) { setLocationLabel(geocodeCache.current.get(gk)!); lastGeocodedPos.current = coords; return; }
      try {
        const res = await fetch(`/api/search?mode=reverse&lat=${coords.lat}&lng=${coords.lng}`);
        if (res.ok) {
          const d = await res.json();
          const location = d.results?.[0]?.location || {};
          const label = [location.locality, location.region, location.country].filter(Boolean).join(', ') || 'Unknown';
          if (geocodeCache.current.size > 500) { const it = geocodeCache.current.keys(); for (let i=0;i<100;i++) { const k = it.next().value; if(k) geocodeCache.current.delete(k); }}
          geocodeCache.current.set(gk, label);
          setLocationLabel(label);
          lastGeocodedPos.current = coords;
        }
      } catch (e) { console.warn('[OPHANIM] Suppressed error:', e instanceof Error ? e.message : e); }
    }, 3000); // 3s debounce (was 1.5s)
  }, []);

  // Region dossier (right-click)
  const handleRightClick = useCallback(async (coords: { lat: number; lng: number }) => {
    setDossierLoading(true); setRegionDossier(null);
    try {
      const res = await fetch(`/api/region-dossier?lat=${coords.lat}&lng=${coords.lng}`);
      if (res.ok) setRegionDossier(await res.json());
    } catch (e) { console.warn('[OPHANIM] Suppressed error:', e instanceof Error ? e.message : e); } finally { setDossierLoading(false); }
  }, []);
  // Entity click handler (hoisted from JSX to comply with Rules of Hooks - Fixes #113)
  const handleEntityClick = useCallback((entity: any) => {
    if (entity?.type === 'cctv') setActiveCamera(entity);
    if (entity?.type === 'live_news' && entity.url) {
      setLiveFeedUrl(entity.url);
      setLiveFeedName(entity.name);
      setLiveFeedEmbedAllowed(entity.embed_allowed !== false);
    }
    if (entity?.type === 'aircraft' || entity?.type === 'vessel') {
      const id = String(entity.id || entity.icao24 || entity.mmsi || entity.name || '').trim();
      if (!id) return;
      setEntityGraphTarget({
        type: entity.type,
        id,
        label: entity.label || entity.name || id,
        properties: entity.properties || {},
      });
      setShowEntityGraph(true);
    }
  }, []);

  // Global handler for map popups to manually open the Intel Graph
  useEffect(() => {
    (window as any).openOphanimIntel = (entity: any) => {
      if (entity?.callsign || entity?.icao24) {
        setEntityGraphTarget({ type: 'aircraft', id: entity.callsign?.trim() || entity.icao24, label: entity.callsign?.trim() || entity.icao24, properties: { model: entity.model, registration: entity.registration, icao24: entity.icao24 } });
        setShowEntityGraph(true);
      } else if (entity?.type === 'vessel' || entity?.mmsi || entity?.imo) {
        setEntityGraphTarget({ type: 'vessel', id: entity.imo || entity.mmsi || entity.name, label: entity.name || entity.imo, properties: { flag: entity.flag, speed: entity.speed, destination: entity.destination } });
        setShowEntityGraph(true);
      } else if (entity?.type === 'ip' && entity?.ip) {
        setEntityGraphTarget({ type: 'ip', id: entity.ip, label: entity.ip, properties: { threat_type: entity.threat_type, status: entity.status } });
        setShowEntityGraph(true);
      } else if (entity?.type === 'country' && entity?.country) {
        setEntityGraphTarget({ type: 'country', id: entity.country, label: entity.country, properties: {} });
        setShowEntityGraph(true);
      }
    };
    return () => { delete (window as any).openOphanimIntel; };
  }, []);

  // ── SHARED FETCH UTILITY (Fixes #107 — single definition, not 3 copies) ──
  const fetchEndpoint = useCallback(async (url: string, transform?: (d: any) => any, options?: RequestInit) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      // Force the browser to bypass its local disk cache for real-time data
      const res = await fetch(url, { ...options, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const d = transform ? transform(json) : json;
        dataRef.current = { ...dataRef.current, ...d };
        setDataVersion(v => v + 1);
        setBackendStatus('connected');
      }
    } catch (e) {
      console.warn('[OPHANIM] Suppressed error:', e instanceof Error ? e.message : e);
      setBackendStatus('error');
    }
  }, []);

  // ── PROGRESSIVE DATA LOADING (request-optimized) ──
  useEffect(() => {
    // Priority 1: Core feeds (always needed for panels)
    const eqUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
    const eqTransform = (data: any) => ({ earthquakes: (data.features || []).map((f: any) => ({ id: f.id, lat: f.geometry?.coordinates?.[1] || 0, lng: f.geometry?.coordinates?.[0] || 0, depth: f.geometry?.coordinates?.[2] || 0, magnitude: f.properties?.mag, place: f.properties?.place, time: f.properties?.time, url: f.properties?.url, tsunami: f.properties?.tsunami, type: f.properties?.type, felt: f.properties?.felt, alert: f.properties?.alert })) });
    fetchEndpoint(eqUrl, eqTransform);
    fetchEndpoint('/api/news');
    fetchEndpoint('/api/cyber-threats', (response) => ({ cyberThreats: response.threats || [] }));
    const marketTimer = setTimeout(() => fetchEndpoint('/api/markets', d => ({ markets: d })), 800);

    // Priority 2: Space Weather (needed for MarketsPanel)
    const spaceTimer = setTimeout(async () => {
      try {
        const r = await fetch('/api/space-weather');
        if (r.ok) setSpaceWeather(await r.json());
      } catch (e) { console.warn('[OPHANIM] Suppressed error:', e instanceof Error ? e.message : e); }
    }, 5000);

    // Polling — OPTIMIZED intervals to minimize edge requests
    const intervals = [
      setInterval(() => fetchEndpoint(eqUrl, eqTransform), 900000),  // 15 min (was 5)
      setInterval(() => fetchEndpoint('/api/news'), 1800000),        // 30 min (was 10)
      setInterval(() => fetchEndpoint('/api/cyber-threats', (response) => ({ cyberThreats: response.threats || [] })), 1800000),
      setInterval(() => fetchEndpoint('/api/markets', d => ({ markets: d })), 900000), // 15 min (was 5)
    ];
    return () => {
      clearTimeout(marketTimer);
      clearTimeout(spaceTimer);
      intervals.forEach(clearInterval);
    };
  }, [fetchEndpoint]);

  // ── LAYER-AWARE DATA LOADING — only fetch when layer is toggled ON ──
  const layerFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {

    // Flights
    if (activeLayers.flights || activeLayers.military || activeLayers.jets || activeLayers.private) {
      if (!layerFetchedRef.current.has('flights')) {
        fetchEndpoint('/api/flights', d => ({ ...d, flight_source: d.source, flight_timestamp: d.timestamp }));
        layerFetchedRef.current.add('flights');
      }
    }
    // Satellites (any satellite sub-layer triggers fetch)
    const anySatLayer = activeLayers.satellites || activeLayers.sat_comms || activeLayers.sat_military || activeLayers.sat_navigation || activeLayers.sat_earth || activeLayers.sat_science;
    if (anySatLayer && !layerFetchedRef.current.has('satellites')) {
      fetchEndpoint('/api/satellites');
      layerFetchedRef.current.add('satellites');
    }
    // Fires
    if (activeLayers.fires && !layerFetchedRef.current.has('fires')) {
      fetchEndpoint('/api/fires');
      layerFetchedRef.current.add('fires');
    }
    // CCTV
    if (activeLayers.cctv && !layerFetchedRef.current.has('cctv')) {
      fetchEndpoint(`/api/cctv?region=all&_t=${Date.now()}`);
      layerFetchedRef.current.add('cctv');
      // Backfill once ~35s later: right after a deploy the server cache is cold,
      // and slow regions (Caltrans → LA/San Diego) can drop out of the first
      // region=all. By 35s the server has warmed, so this refetch fills them in.
      setTimeout(() => fetchEndpoint(`/api/cctv?region=all&_t=${Date.now()}`), 35000);
    }
    // Maritime
    if (activeLayers.maritime && !layerFetchedRef.current.has('maritime')) {
      fetchEndpoint('/api/maritime', d => ({ maritime_ports: d.ports, maritime_chokepoints: d.chokepoints, maritime_ships: d.ships, maritime_sources: d.sources, maritime_timestamp: d.timestamp }));
      layerFetchedRef.current.add('maritime');
    }
    // Balloons
    if (activeLayers.balloons && !layerFetchedRef.current.has('balloons')) {
      fetchEndpoint('/api/balloons', d => ({ balloons: d.balloons }));
      layerFetchedRef.current.add('balloons');
    }
    // Radiation
    if (activeLayers.radiation && !layerFetchedRef.current.has('radiation')) {
      fetchEndpoint('/api/radiation', d => ({ radiation: d.stations }));
      layerFetchedRef.current.add('radiation');
    }
    // Live News
    if (activeLayers.live_news && !layerFetchedRef.current.has('live_news')) {
      fetchEndpoint('/api/live-news', d => ({ live_feeds: d.feeds }));
      layerFetchedRef.current.add('live_news');
    }
    // Weather
    if (activeLayers.weather && !layerFetchedRef.current.has('weather')) {
      fetchEndpoint('/api/weather', d => ({ weather_events: d.events }));
      layerFetchedRef.current.add('weather');
    }
    // Infrastructure
    if (activeLayers.infrastructure && !layerFetchedRef.current.has('infrastructure')) {
      fetchEndpoint('/api/infrastructure', d => ({ infrastructure: d.infrastructure }));
      layerFetchedRef.current.add('infrastructure');
    }
    // Global Incidents (GDELT)
    if (activeLayers.global_incidents && !layerFetchedRef.current.has('gdelt')) {
      fetchEndpoint('/api/gdelt', d => ({ gdelt: d.events }));
      layerFetchedRef.current.add('gdelt');
    }

    // Submarine Cables
    if (activeLayers.cables && !layerFetchedRef.current.has('cables')) {
      (async () => {
        try {
          const ts = Date.now();
      const res = await fetch(`/data/submarine-cables.json?v=${ts}`);
          if (res.ok) {
             const cablesData = await res.json();
             dataRef.current = { ...dataRef.current, submarine_cables: cablesData.features };
             setDataVersion(v => v + 1);
          }
        } catch (e) { console.warn('Cables fetch failed'); }
      })();
      layerFetchedRef.current.add('cables');
    }


    // Live Malware (abuse.ch)
    if (activeLayers.malware && !layerFetchedRef.current.has('malware')) {
      fetchEndpoint('/api/malware', d => ({ malware_threats: d.threats }));
      layerFetchedRef.current.add('malware');
    }


  }, [activeLayers]);

  // ── LAYER-AWARE POLLING — only poll data for active layers ──
  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = [];
    if (activeLayers.flights || activeLayers.military || activeLayers.jets || activeLayers.private) {
      intervals.push(setInterval(() => fetchEndpoint('/api/flights', d => ({ ...d, flight_source: d.source, flight_timestamp: d.timestamp })), 300000)); // 5 min (was 2 min)
    }

    if (activeLayers.balloons) {
      intervals.push(setInterval(() => fetchEndpoint('/api/balloons', d => ({ balloons: d.balloons })), 300000)); // 5m
    }
    if (activeLayers.radiation) {
      intervals.push(setInterval(() => fetchEndpoint('/api/radiation', d => ({ radiation: d.stations })), 300000)); // 5m
    }
    if (activeLayers.maritime) {
      intervals.push(setInterval(() => fetchEndpoint('/api/maritime', d => ({ maritime_ports: d.ports, maritime_chokepoints: d.chokepoints, maritime_ships: d.ships })), 60000)); // 60s — was 10s; a 3MB poll every 10s OOM'd the prod container
    }
    return () => intervals.forEach(clearInterval);
  }, [activeLayers, fetchEndpoint]);

  // CCTV: loaded once on layer toggle via layerFetchedRef (no viewport polling)

  // Reactive layer fetch: handled by layerFetchedRef above (no duplicate)

  // ── OPHANIM SDK — Intelligence Fusion Layer ──
  // Produces node coordinates for the SDK network mesh visualization.
  // Does NOT duplicate existing layer visuals — SDK layer is LINES ONLY.
  // Cameras are excluded — they have their own dedicated layer.
  useEffect(() => {
    const anyActive = activeLayers.sdk_sea || activeLayers.sdk_air || activeLayers.sdk_naval;
    if (!anyActive) {
      dataRef.current = { ...dataRef.current, sdk_entities: [] };
      return;
    }

    const sdkEntities: any[] = [];

    // Air domain (nodes only — no visual duplication)
    const allFlights = [
      ...(data.commercial_flights || []),
      ...(data.private_flights || []),
      ...(data.private_jets || []),
      ...(data.military_flights || []),
    ];
    // Sample flights to keep it clean (every Nth)
    const flightStep = Math.max(1, Math.floor(allFlights.length / 60));
    for (let i = 0; i < allFlights.length; i += flightStep) {
      const f = allFlights[i];
      if (!f.lat || !f.lng) continue;
      sdkEntities.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties: { domain: 'AIR', name: f.callsign?.trim() || 'TRACK', source: 'ADS-B / OpenSky' },
      });
    }

    // Sea domain
    const ships = data.maritime_ships || [];
    const shipStep = Math.max(1, Math.floor(ships.length / 60));
    for (let i = 0; i < ships.length; i += shipStep) {
      const s = ships[i];
      if (!s.lat || !s.lng) continue;
      sdkEntities.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: { domain: 'SEA', name: s.name || `MMSI-${s.mmsi}`, source: 'AIS Stream' },
      });
    }

    // Events — Earthquakes
    if (data.earthquakes?.length) {
      for (const eq of data.earthquakes) {
        if (!eq.lat || !eq.lng) continue;
        sdkEntities.push({
          type: 'Feature', geometry: { type: 'Point', coordinates: [eq.lng, eq.lat] },
          properties: { domain: 'LAND', name: `M${eq.magnitude} ${eq.place || ''}`, source: 'USGS' },
        });
      }
    }

    // GDELT events
    if (data.gdelt?.length) {
      for (const g of data.gdelt) {
        if (!g.lat || !g.lng) continue;
        sdkEntities.push({
          type: 'Feature', geometry: { type: 'Point', coordinates: [g.lng, g.lat] },
          properties: { domain: 'INTEL', name: g.name || 'GDELT Event', source: 'GDELT Project' },
        });
      }
    }

    // News intel
    if (data.news?.length) {
      for (const n of data.news) {
        if (!n.coords || n.coords.length < 2) continue;
        sdkEntities.push({
          type: 'Feature', geometry: { type: 'Point', coordinates: [n.coords[1], n.coords[0]] },
          properties: { domain: 'INTEL', name: n.title || 'SIGINT', source: n.source || 'RSS Feed' },
        });
      }
    }

    dataRef.current = { ...dataRef.current, sdk_entities: sdkEntities };
  }, [dataVersion, activeLayers.sdk_sea, activeLayers.sdk_air, activeLayers.sdk_naval]);

  const totalFlights = useMemo(() => (
    (data.commercial_flights?.length||0)+(data.private_flights?.length||0)+(data.private_jets?.length||0)+(data.military_flights?.length||0)
  ), [data.commercial_flights, data.private_flights, data.private_jets, data.military_flights]);

  // ── COMMAND PALETTE (⌘K) — unified launcher for layers, navigation, panels & display ──
  const flyTo = useCallback((lat: number, lng: number, zoom: number) => {
    setFlyToLocation({ lat, lng, ts: Date.now() });
    setMapView(v => ({ ...v, zoom }));
  }, []);
  const closeRightPanels = useCallback(() => {
    setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowEntityGraph(false); setShowDesktopSearch(false); setShowFusion(false); setShowAiAnalyst(false);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const LAYER_DEFS: { key: keyof typeof activeLayers; label: string; hint: string }[] = [
      { key: 'flights', label: 'Commercial Flights', hint: 'ADS-B / OpenSky' },
      { key: 'private', label: 'Private Aircraft', hint: 'ADS-B' },
      { key: 'jets', label: 'Private Jets', hint: 'ADS-B' },
      { key: 'military', label: 'Military Aircraft', hint: 'ADS-B' },
      { key: 'maritime', label: 'Maritime / Naval', hint: 'Ports / Chokepoints / Ships' },
      { key: 'satellites', label: 'Satellites', hint: 'Orbital tracking' },
      { key: 'sat_military', label: 'Military Satellites', hint: 'Intel constellations' },
      { key: 'balloons', label: 'High-Altitude Balloons', hint: 'Stratospheric' },
      { key: 'cctv', label: 'CCTV Cameras', hint: 'Public traffic cams' },
      { key: 'live_news', label: 'Live News Feeds', hint: '24/7 broadcasters' },
      { key: 'news_intel', label: 'SIGINT News', hint: 'Geoparsed RSS' },
      { key: 'earthquakes', label: 'Earthquakes', hint: 'USGS M2.5+' },
      { key: 'fires', label: 'Active Fires', hint: 'NASA FIRMS' },
      { key: 'weather', label: 'Severe Weather', hint: 'EONET + NWS + GDACS' },
      { key: 'radiation', label: 'Radiation Monitors', hint: 'Geiger network' },
      { key: 'infrastructure', label: 'Nuclear Facilities', hint: 'Critical infra' },
      { key: 'global_incidents', label: 'Global Incidents', hint: 'GDELT events' },
      { key: 'gps_jamming', label: 'GPS Jamming', hint: 'Interference zones' },
      { key: 'malware', label: 'Live Malware', hint: 'abuse.ch threat feed' },
      { key: 'cables', label: 'Submarine Cables', hint: 'Undersea backbone' },
      { key: 'war_sanctions', label: 'GUR Shadow Fleet & Sanctions', hint: 'Source-listed vessel-associated ports' },
      { key: 'day_night', label: 'Day / Night Terminator', hint: 'Solar overlay' },
      { key: 'terrain_3d', label: '3D Terrain & Buildings', hint: 'Elevation mesh' },
    ];
    const layerCount = (k: string): string => {
      const map: Record<string, string> = {
        flights: 'commercial_flights', private: 'private_flights', jets: 'private_jets', military: 'military_flights',
        maritime: 'maritime_ships', satellites: 'satellites', earthquakes: 'earthquakes', fires: 'fires',
        cctv: 'cameras', live_news: 'live_feeds', global_incidents: 'gdelt', malware: 'malware_threats',
      };
      const dk = map[k];
      const arr = dk ? (data as Record<string, unknown>)[dk] : undefined;
      return Array.isArray(arr) && arr.length ? String(arr.length) : '';
    };

    const NAV: { label: string; hint: string; lat: number; lng: number; zoom: number }[] = [
      { label: 'Global View', hint: 'Whole earth', lat: 20, lng: 0, zoom: 2.5 },
      { label: 'Ukraine', hint: 'Active conflict', lat: 49, lng: 32, zoom: 6 },
      { label: 'Middle East', hint: 'Regional theatre', lat: 30, lng: 45, zoom: 4.5 },
      { label: 'Gaza / Israel', hint: 'Conflict zone', lat: 31.5, lng: 34.7, zoom: 8 },
      { label: 'Taiwan Strait', hint: 'Flashpoint', lat: 24.5, lng: 120, zoom: 6.5 },
      { label: 'South China Sea', hint: 'Disputed waters', lat: 14, lng: 114, zoom: 5 },
      { label: 'Strait of Hormuz', hint: 'Oil chokepoint', lat: 26.6, lng: 56.3, zoom: 7.5 },
      { label: 'Suez Canal', hint: 'Maritime chokepoint', lat: 30.5, lng: 32.35, zoom: 8 },
      { label: 'Panama Canal', hint: 'Maritime chokepoint', lat: 9.1, lng: -79.7, zoom: 8 },
      { label: 'Bab-el-Mandeb', hint: 'Red Sea gate', lat: 12.6, lng: 43.3, zoom: 7.5 },
      { label: 'Washington DC', hint: 'Capital', lat: 38.9, lng: -77.04, zoom: 9 },
      { label: 'Moscow', hint: 'Capital', lat: 55.75, lng: 37.62, zoom: 9 },
      { label: 'Beijing', hint: 'Capital', lat: 39.9, lng: 116.4, zoom: 9 },
      { label: 'London', hint: 'Capital', lat: 51.5, lng: -0.12, zoom: 9 },
      { label: 'Kyiv', hint: 'Capital', lat: 50.45, lng: 30.52, zoom: 9 },
      { label: 'Tehran', hint: 'Capital', lat: 35.7, lng: 51.4, zoom: 9 },
      { label: 'Pyongyang', hint: 'Capital', lat: 39.04, lng: 125.76, zoom: 9 },
    ];

    const cmds: PaletteCommand[] = [];

    // Layers
    for (const l of LAYER_DEFS) {
      const on = !!activeLayers[l.key];
      const cnt = on ? layerCount(l.key as string) : '';
      cmds.push({
        id: `layer:${String(l.key)}`,
        group: 'LAYERS',
        title: `${on ? 'Hide' : 'Show'} ${l.label}`,
        subtitle: l.hint,
        keywords: `layer toggle ${l.label} ${l.hint}`,
        icon: <Layers className="w-4 h-4" />,
        badge: on ? (cnt || 'ON') : 'OFF',
        active: on,
        keepOpen: true,
        run: () => setActiveLayers(prev => ({ ...prev, [l.key]: !prev[l.key] })),
      });
    }

    // Navigation
    for (const n of NAV) {
      cmds.push({
        id: `nav:${n.label}`,
        group: 'NAVIGATE',
        title: `Fly to ${n.label}`,
        subtitle: n.hint,
        keywords: `go navigate location ${n.label} ${n.hint}`,
        icon: <Crosshair className="w-4 h-4" />,
        run: () => flyTo(n.lat, n.lng, n.zoom),
      });
    }

    // Panels & tools
    cmds.push(
      { id: 'panel:recon', group: 'TOOLS', title: 'Open RECON / OSINT Toolkit', subtitle: 'Scanner / WHOIS / DNS / Crypto / Sanctions', keywords: 'recon osint scanner whois dns vuln crypto sanctions', icon: <Radar className="w-4 h-4" />, run: () => { closeRightPanels(); setShowIntel(true); } },
      { id: 'panel:markets', group: 'TOOLS', title: 'Open Markets & Intel', subtitle: 'Indices / commodities / space weather', keywords: 'markets stocks commodities finance', icon: <BarChart3 className="w-4 h-4" />, run: () => { closeRightPanels(); setShowMarkets(true); } },
      { id: 'panel:alerts', group: 'TOOLS', title: 'Open Live Alerts', subtitle: 'Real-time event stream', keywords: 'alerts warnings events', icon: <AlertTriangle className="w-4 h-4" />, run: () => { closeRightPanels(); setShowAlerts(true); } },
      { id: 'panel:graph', group: 'TOOLS', title: 'Open Entity Graph', subtitle: 'Link analysis & fusion', keywords: 'entity graph network link analysis', icon: <Network className="w-4 h-4" />, run: () => { closeRightPanels(); setShowEntityGraph(true); } },
      { id: 'panel:search', group: 'TOOLS', title: 'Open Search', subtitle: 'Find places & entities', keywords: 'search find place', icon: <Search className="w-4 h-4" />, run: () => { closeRightPanels(); setShowDesktopSearch(true); } },
      { id: 'nav:imports', group: 'WORKSPACE', title: 'Open CSV Import', subtitle: 'Import organization-scoped operational data', keywords: 'csv import shipment client asset inventory', icon: <FileUp className="w-4 h-4" />, run: () => window.location.assign('/imports') },
      { id: 'panel:layers', group: 'TOOLS', title: 'Toggle Layer Sidebar', subtitle: 'Show / hide layer rail', keywords: 'layers panel sidebar', icon: <Layers className="w-4 h-4" />, keepOpen: true, run: () => setShowLayers(p => !p) },
    );

    // Display
    cmds.push(
      { id: 'disp:proj', group: 'DISPLAY', title: mapProjection === 'globe' ? 'Switch to 2D Map' : 'Switch to 3D Globe', subtitle: 'Map projection', keywords: 'globe mercator 2d 3d projection', icon: <Globe className="w-4 h-4" />, badge: mapProjection === 'globe' ? 'GLOBE' : 'FLAT', active: mapProjection === 'globe', keepOpen: true, run: () => setMapProjection(p => p === 'globe' ? 'mercator' : 'globe') },
      { id: 'disp:style', group: 'DISPLAY', title: mapStyle === 'dark' ? 'Satellite Imagery' : 'Night / Dark Basemap', subtitle: 'Basemap style', keywords: 'satellite imagery dark night basemap style', icon: <Satellite className="w-4 h-4" />, badge: mapStyle === 'satellite' ? 'SAT' : 'DARK', active: mapStyle === 'satellite', keepOpen: true, run: () => setMapStyle(s => s === 'dark' ? 'satellite' : 'dark') },
      { id: 'disp:theme', group: 'DISPLAY', title: ophanimTheme === 'ghost' ? 'Switch to Lattice Mode' : 'Switch to Eclipse Mode', subtitle: 'Interface theme', keywords: 'theme lattice eclipse teal violet colour', icon: <Moon className="w-4 h-4" />, badge: ophanimTheme === 'ghost' ? 'ECLIPSE' : 'LATTICE', active: ophanimTheme === 'ghost', keepOpen: true, run: () => setOphanimTheme(t => t === 'core' ? 'ghost' : 'core') },
      { id: 'disp:fs', group: 'DISPLAY', title: 'Toggle Fullscreen', subtitle: 'Immersive mode', keywords: 'fullscreen immersive', icon: <MapPinned className="w-4 h-4" />, run: toggleFullscreen },
    );

    return cmds;
  }, [activeLayers, mapProjection, mapStyle, ophanimTheme, data, flyTo, closeRightPanels, toggleFullscreen]);


  return (
    <main className="fixed inset-0 w-full h-full bg-[var(--bg-void)] overflow-hidden">

      {/* ── SPLASH ── */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden"
            style={{ background: 'radial-gradient(ellipse at center, rgba(124,255,203,0.12) 0%, rgba(8,12,24,0.8) 42%, var(--bg-void) 72%)' }}
          >
            {/* ── Scanline CRT overlay ── */}
            <div className="absolute inset-0 pointer-events-none z-[1]" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(124,255,203,0.018) 2px, rgba(124,255,203,0.018) 4px)',
              animation: 'splashScanDrift 8s linear infinite',
            }} />

            {/* ── V4.2 badge — top-left ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="absolute top-6 left-6 z-[2] font-mono text-[10px] tracking-[0.3em] text-[var(--gold-primary)]"
            >
              V4.2
            </motion.div>



            {/* ── Geometric tactical logo ── */}
            <div className="relative w-40 h-40 mb-8 flex items-center justify-center z-[2]">
              {/* Outer ring — slow clockwise */}
              <motion.div
                initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: 360 }}
                transition={{ opacity: { duration: 0.6 }, scale: { duration: 0.8, ease: 'easeOut' }, rotate: { duration: 20, repeat: Infinity, ease: 'linear' } }}
                className="absolute inset-0 rounded-full"
                style={{ border: '1px solid rgba(124,255,203,0.22)' }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: 'var(--gold-primary)', boxShadow: '0 0 12px var(--gold-primary), 0 0 24px rgba(124,255,203,0.3)' }} />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1 h-1 rounded-full" style={{ background: 'rgba(124,255,203,0.42)', boxShadow: '0 0 6px rgba(124,255,203,0.3)' }} />
              </motion.div>

              {/* Middle ring — faster counter-clockwise */}
              <motion.div
                initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: -360 }}
                transition={{ opacity: { duration: 0.6, delay: 0.15 }, scale: { duration: 0.8, delay: 0.15, ease: 'easeOut' }, rotate: { duration: 12, repeat: Infinity, ease: 'linear' } }}
                className="absolute rounded-full"
                style={{ inset: '18px', border: '1px solid rgba(137,118,255,0.2)' }}
              >
                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--cyan-primary)', boxShadow: '0 0 10px var(--cyan-primary), 0 0 20px rgba(137,118,255,0.22)' }} />
                <div className="absolute bottom-0 left-1/4 translate-y-1/2 w-1 h-1 rounded-full" style={{ background: 'rgba(137,118,255,0.44)' }} />
              </motion.div>

              {/* Inner ring — fastest clockwise */}
              <motion.div
                initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: 360 }}
                transition={{ opacity: { duration: 0.6, delay: 0.3 }, scale: { duration: 0.8, delay: 0.3, ease: 'easeOut' }, rotate: { duration: 7, repeat: Infinity, ease: 'linear' } }}
                className="absolute rounded-full"
                style={{ inset: '40px', border: '1px solid rgba(124,255,203,0.28)' }}
              >
                <div className="absolute top-0 left-1/4 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--gold-primary)', boxShadow: '0 0 8px var(--gold-primary)' }} />
              </motion.div>

              {/* Core circle + crosshair */}
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
                className="relative w-12 h-12 rounded-full flex items-center justify-center"
                style={{ border: '2px solid var(--gold-primary)', boxShadow: '0 0 22px rgba(124,255,203,0.16), inset 0 0 20px rgba(137,118,255,0.08)' }}
              >
                <motion.div
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-5 h-5 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(124,255,203,0.42) 0%, rgba(137,118,255,0.08) 70%)' }}
                />
                {/* Crosshair lines */}
                <div className="absolute w-[1px] h-full" style={{ background: 'linear-gradient(to bottom, transparent, rgba(124,255,203,0.3), transparent)' }} />
                <div className="absolute w-full h-[1px]" style={{ background: 'linear-gradient(to right, transparent, rgba(124,255,203,0.3), transparent)' }} />
              </motion.div>

              <OphanimMark className="absolute inset-3 drop-shadow-[0_0_28px_rgba(124,255,203,0.24)]" animated />

              {/* Faint pulsing radar sweep */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.15, 0], rotate: [0, 360] }}
                transition={{ opacity: { duration: 3, repeat: Infinity }, rotate: { duration: 3, repeat: Infinity, ease: 'linear' }, delay: 0.6 }}
                className="absolute inset-[10px] rounded-full"
                style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(124,255,203,0.18) 40deg, transparent 82deg)' }}
              />
            </div>

            {/* ── OPHANIM title — letter-by-letter stagger ── */}
            <div className="flex items-center gap-[2px] mb-3 z-[2]">
              {'OPHANIM'.split('').map((letter, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.5, ease: 'easeOut' }}
                  className="text-4xl md:text-5xl font-semibold tracking-[0.42em] font-sans"
                  style={{ color: 'var(--text-heading)', textShadow: '0 0 30px rgba(124,255,203,0.2)' }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>

            {/* ── Subtitle — typewriter reveal ── */}
            <div className="overflow-hidden mb-8 z-[2]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ delay: 1.2, duration: 0.8, ease: 'easeInOut' }}
                className="overflow-hidden whitespace-nowrap"
              >
                <p className="text-[10px] md:text-[11px] font-mono tracking-[0.5em] text-[var(--gold-primary)]" style={{ opacity: 0.8 }}>
                  LIVE INTELLIGENCE ATLAS
                </p>
              </motion.div>
            </div>

            {/* ── Multi-stage progress bar ── */}
            <div className="w-64 md:w-80 z-[2]">
              {/* Thin progress track */}
              <div className="relative w-full h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(124,255,203,0.1)' }}>
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: ['0%', '25%', '50%', '78%', '100%'] }}
                  transition={{ duration: 2.2, delay: 0.5, times: [0, 0.25, 0.5, 0.75, 1], ease: 'easeInOut' }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: 'linear-gradient(90deg, var(--gold-primary), var(--cyan-primary), var(--alert-green))', boxShadow: '0 0 12px rgba(124,255,203,0.34)' }}
                />
              </div>

              {/* Status messages — cycling */}
              <div className="mt-3 h-4 flex items-center justify-center">
                {[
                  { text: 'OPENING LATTICE...', delay: 0.5 },
                  { text: 'SYNCING LIVE FEEDS...', delay: 1.1 },
                  { text: 'ALIGNING MAP LAYERS...', delay: 1.7 },
                  { text: 'ATLAS READY', delay: 2.2 },
                ].map((stage, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 1, 0] }}
                    transition={{ delay: stage.delay, duration: 0.6, times: [0, 0.1, 0.7, 1] }}
                    className="absolute text-[9px] font-mono tracking-[0.25em]"
                    style={{ color: i === 3 ? 'var(--cyan-primary)' : 'var(--text-muted)' }}
                  >
                    {stage.text}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* ── Decorative grid lines ── */}
            <div className="absolute inset-0 pointer-events-none z-[0]" style={{ opacity: 0.03 }}>
              <div className="absolute inset-0" style={{
                backgroundImage: 'linear-gradient(rgba(124,255,203,0.42) 1px, transparent 1px), linear-gradient(90deg, rgba(124,255,203,0.42) 1px, transparent 1px)',
                backgroundSize: '60px 60px',
              }} />
            </div>

            {/* ── Corner frame accents ── */}
            {[
              { t: '10px', l: '10px', bw: '2px 0 0 2px' },
              { t: '10px', r: '10px', bw: '2px 2px 0 0' },
              { b: '10px', l: '10px', bw: '0 0 2px 2px' },
              { b: '10px', r: '10px', bw: '0 2px 2px 0' },
            ].map((pos, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
                className="absolute w-8 h-8 z-[2]"
                style={{ top: pos.t, bottom: pos.b, left: pos.l, right: pos.r, borderWidth: pos.bw, borderStyle: 'solid', borderColor: 'var(--gold-primary)' }}
              />
            ))}



            {/* ── Inline keyframe for scanline drift ── */}

          </motion.div>
        )}
      </AnimatePresence>



      {/* ── MAP ── */}
      <ErrorBoundary name="Map">
        <OphanimMap
          key={ophanimTheme}
          data={data}
          activeLayers={activeLayers}
          projection={mapProjection}
          mapStyle={mapStyle === 'satellite' ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'dark'}
          onEntityClick={handleEntityClick}
          onMouseCoords={handleMouseCoords}
          onRightClick={handleRightClick}
          onViewStateChange={setMapView}
          flyToLocation={flyToLocation}
          sweepData={sweepData}
          scanTargets={scanTargets}
          demoMode={demoMode}
          theme={ophanimTheme}
          providerLayers={providerLayers}
        />
      </ErrorBoundary>


      {/* ── MAP VIEW CONTROLS (3D/2D + SATELLITE TOGGLE) — unified glass control ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.5 }}
        className="ophanim-map-controls absolute bottom-[75px] md:bottom-[100px] z-[200] flex items-center pointer-events-none"
        style={{ right: isMobile ? '12px' : '28px' }}
      >
        <div className="ophanim-map-controls__surface flex items-center gap-1 p-1 pointer-events-auto">
          {/* 3D/2D Toggle */}
          <button
            onClick={() => setMapProjection(p => p === 'globe' ? 'mercator' : 'globe')}
            className="group relative flex items-center justify-center w-10 h-10 rounded-[10px] transition-colors"
            style={{
              background: mapProjection === 'globe' ? 'rgba(0,229,255,0.12)' : 'transparent',
              boxShadow: mapProjection === 'globe' ? 'inset 0 0 0 1px rgba(0,229,255,0.35)' : 'none',
            }}
            title={mapProjection === 'globe' ? 'Switch to 2D Map' : 'Switch to 3D Globe'}
          >
            {mapProjection === 'globe'
              ? <Globe className="w-[18px] h-[18px] text-[var(--cyan-primary)] group-hover:scale-110 transition-transform" />
              : <MapPinned className="w-[18px] h-[18px] text-[var(--text-secondary)] group-hover:text-[var(--gold-primary)] group-hover:scale-110 transition-all" />}
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 text-[8px] font-mono tracking-widest text-[var(--text-secondary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity glass-panel px-2 py-1 z-[300]">
              {mapProjection === 'globe' ? '3D GLOBE' : '2D MAP'}
            </span>
          </button>

          <div className="w-px h-6 bg-white/10" />

          {/* Map Style Toggle */}
          <button
            onClick={() => setMapStyle(s => s === 'dark' ? 'satellite' : 'dark')}
            className="group relative flex items-center justify-center w-10 h-10 rounded-[10px] transition-colors"
            style={{
              background: mapStyle === 'satellite' ? 'rgba(0,230,118,0.12)' : 'transparent',
              boxShadow: mapStyle === 'satellite' ? 'inset 0 0 0 1px rgba(0,230,118,0.35)' : 'none',
            }}
            title={mapStyle === 'dark' ? 'Switch to Satellite' : 'Switch to Night'}
          >
            {mapStyle === 'satellite'
              ? <Satellite className="w-[18px] h-[18px] text-[var(--alert-green)] group-hover:scale-110 transition-transform" />
              : <Moon className="w-[18px] h-[18px] text-[var(--text-secondary)] group-hover:text-[var(--cyan-primary)] group-hover:scale-110 transition-all" />}
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 text-[8px] font-mono tracking-widest text-[var(--text-secondary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity glass-panel px-2 py-1 z-[300]">
              {mapStyle === 'satellite' ? 'SATELLITE' : 'NIGHT'}
            </span>
          </button>
        </div>
      </motion.div>

      {/* ── HEADER ── */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 2.5 }} className={`ophanim-brand-block absolute top-5 z-[200] pointer-events-none flex flex-col`} style={{ left: isMobile ? '20px' : '28px', right: '24px' }}>
        <div className="flex items-center gap-3 w-fit">
          <OphanimMark className="w-9 h-9 md:w-11 md:h-11 shrink-0 drop-shadow-[0_0_16px_rgba(124,255,203,0.32)]" />
          <div className="flex flex-col items-start gap-0.5">
            <h1 className="text-lg md:text-xl font-extrabold tracking-[0.06em] text-[var(--text-heading)]">OPHANIM</h1>
            <span className="text-[8px] md:text-[9px] font-semibold tracking-[0.08em] opacity-80 uppercase text-[var(--cyan-primary)]">Global intelligence workspace</span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 pl-[44px] min-w-0 pr-4">
          <span className="text-[8px] text-[var(--text-muted)] font-medium tracking-[0.03em] opacity-70 truncate">
            Search, observe, and investigate live signals
          </span>
        </div>
      </motion.div>

      {!isMobile && (
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.65 }} className="ophanim-command-bar ophanim-command-dock ophanim-header-command absolute top-5 z-[220] pointer-events-auto">
          <div className="ophanim-command-search"><SearchBar alwaysExpanded onLocate={(lat, lng, zoom) => setFlyToLocation({ lat, lng, zoom, ts: Date.now() })} onAction={(action) => { if (action.type === 'enable_layers') setActiveLayers((previous) => ({ ...previous, ...Object.fromEntries(action.layers.map((layer) => [layer, true])) })); }} /></div>
          <div className="ophanim-command-actions">
            <button onClick={() => { setShowNews(!showNews); setShowAiAnalyst(false); setShowFusion(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowEntityGraph(false); }} className={`ophanim-command-button ${showNews ? 'is-active' : ''}`} title="Open live news intelligence"><Newspaper className="w-4 h-4" /><span>NEWS</span></button>
            <button onClick={() => { setAiPanelMode('settings'); setShowAiAnalyst(true); setShowNews(false); setShowFusion(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowEntityGraph(false); }} className="ophanim-command-button ophanim-command-button--primary" title="Configure API key or local AI model"><Settings className="w-4 h-4" /><span>AI SETUP</span></button>
            <button onClick={() => window.dispatchEvent(new Event('ophanim:open-watchlists'))} className="ophanim-command-button" title="Open Watchlists"><Bookmark className="w-4 h-4" /><span>WATCH</span></button>
            <button onClick={() => window.location.assign('/imports')} className="ophanim-command-button" title="Import organization CSV data"><FileUp className="w-4 h-4" /><span>IMPORT</span></button>
            <button onClick={() => setShowProviders((value) => !value)} className="ophanim-command-button" title="View provider and source status"><Database className="w-4 h-4" /><span>SOURCES</span></button>
          </div>
        </motion.div>
      )}

      {isMobile && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.65 }} className="absolute top-[108px] left-3 right-3 z-[230] grid grid-cols-5 gap-1.5 pointer-events-auto">
          <button onClick={() => { setAiPanelMode('settings'); setShowAiAnalyst(true); setShowProviders(false); setMobilePanel(null); }} className="ophanim-command-button ophanim-command-button--primary min-w-0 justify-center" title="Configure API key or local AI model"><Settings className="w-3.5 h-3.5 shrink-0" /><span>AI SETUP</span></button>
          <button onClick={() => { setMobilePanel('intel'); setShowAiAnalyst(false); setShowProviders(false); }} className="ophanim-command-button min-w-0 justify-center" title="Open live news intelligence"><Newspaper className="w-3.5 h-3.5 shrink-0" /><span>NEWS</span></button>
          <button onClick={() => { setMobilePanel(null); window.dispatchEvent(new Event('ophanim:open-watchlists')); }} className="ophanim-command-button min-w-0 justify-center" title="Open Watchlists"><Bookmark className="w-3.5 h-3.5 shrink-0" /><span>WATCH</span></button>
          <button onClick={() => window.location.assign('/imports')} className="ophanim-command-button min-w-0 justify-center" title="Import organization CSV data"><FileUp className="w-3.5 h-3.5 shrink-0" /><span>IMPORT</span></button>
          <button onClick={() => { setShowProviders((value) => !value); setShowAiAnalyst(false); setMobilePanel(null); }} className="ophanim-command-button min-w-0 justify-center" title="View provider and source status"><Database className="w-3.5 h-3.5 shrink-0" /><span>SOURCES</span></button>
        </motion.div>
      )}


      {/* ── TOP-RIGHT STATUS (desktop) — C2 DISPLAY ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }} className="status-bar-desktop absolute top-4 right-6 z-[200] pointer-events-none flex items-center gap-4 text-[9px] font-mono tracking-widest text-[var(--text-muted)]">

        <span className="hidden lg:inline-flex items-center gap-1.5">
          <ZuluClock />
        </span>

        <span className="flex items-center gap-1">SYS: <span className={backendStatus === 'connected' ? 'text-[var(--alert-green)]' : 'text-[var(--alert-red)]'}>{backendStatus.toUpperCase()}</span></span>

        {spaceWeather && <span className="hidden lg:inline">SOLAR: <span style={{ color: spaceWeather.storm_color, fontWeight: 700 }}>Kp{spaceWeather.kp_index}</span></span>}

        <span className="hidden lg:inline-flex items-center gap-1">
          <span className="text-[var(--cyan-primary)] font-bold">{Object.values(activeLayers).filter(Boolean).length}</span>
          <span className="text-[var(--text-muted)]/60">FEEDS</span>
        </span>

        <UptimeClock />
        <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] opacity-50 ml-2">V.4.1</span>


      </motion.div>

      {/* ── MOBILE: Compact top status ── */}
      {isMobile && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }} className="absolute top-3 right-3 z-[200] pointer-events-auto flex items-center gap-2">
        </motion.div>
      )}
      {isMobile && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }} className="absolute top-3 right-3 z-[200] pointer-events-auto flex items-center gap-2">
        </motion.div>
      )}



      {/* ── NEW SIDEBAR (Root Level) ── */}
      {showLayers && !isMobile && <LayerPanel data={data} activeLayers={activeLayers} setActiveLayers={setActiveLayers} theme={ophanimTheme} setTheme={setOphanimTheme} />}
      <WatchlistPanel />
      {isMobile && showAiAnalyst && <AiAnalyst data={data} mode={aiPanelMode} />}
      <AnimatePresence>
        {showProviders && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`absolute left-1/2 z-[260] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 pointer-events-auto ${isMobile ? 'top-[156px]' : 'top-[86px]'}`}>
            <ProviderStatusPanel />
          </motion.div>
        )}
      </AnimatePresence>



      {/* ── RIGHT TOOL STRIP (desktop only — mobile uses bottom nav) ── */}
      {!isMobile && <div className="ophanim-context-rail absolute right-4 top-[130px] flex flex-col gap-1 z-[250] pointer-events-auto">
        <div className="ophanim-context-title">INTELLIGENCE</div>
        <div className="relative group">
          <button onClick={() => { setAiPanelMode('briefing'); setShowAiAnalyst(!showAiAnalyst); setShowNews(false); setShowFusion(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowEntityGraph(false); }} className={`ophanim-context-button ${showAiAnalyst ? 'is-active' : ''}`} title="AI Analyst">
            <Brain className={`w-4 h-4 ${showAiAnalyst ? 'text-[var(--cyan-primary)]' : 'text-white/60'}`} />
            <span>Analyst</span>
          </button>
          <AnimatePresence>{showAiAnalyst && <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80"><AiAnalyst data={data} mode={aiPanelMode} /></motion.div>}</AnimatePresence>
        </div>
        <div className="relative group">
          <button onClick={() => { setShowFusion(!showFusion); setShowNews(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowEntityGraph(false); }} className={`ophanim-context-button ${showFusion ? 'is-active is-alert' : ''}`} title="Global Threat Fusion">
            <Activity className={`w-4 h-4 ${showFusion ? 'text-[#FF1744]' : 'text-white/60'}`} />
            <span>Fusion</span>
          </button>
          {/* Threat Fusion HUD Slideout */}
          <AnimatePresence>
            {showFusion && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2">
                <ThreatFusionHUD onLocate={(lat, lng) => { setFlyToLocation({ lat, lng, ts: Date.now() }); setMapView(v => ({ ...v, zoom: Math.max(v.zoom, 5) })); }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowNews(!showNews); setShowAiAnalyst(false); setShowFusion(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowEntityGraph(false); }} className={`ophanim-context-button ${showNews ? 'is-active' : ''}`} title="Live news intelligence">
            <Newspaper className={`w-4 h-4 ${showNews ? 'text-[var(--cyan-primary)]' : 'text-white/60'}`} />
            <span>News</span>
          </button>
          <AnimatePresence>
            {showNews && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <IntelFeed data={data} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowIntel(!showIntel); setShowNews(false); setShowMarkets(false); setShowAlerts(false); setShowFusion(false); }} className={`ophanim-context-button ${showIntel ? 'is-active' : ''}`} title="Recon tools">
            <Radar className={`w-4 h-4 ${showIntel ? 'text-[var(--cyan-primary)]' : 'text-white/60'}`} />
            <span>Recon</span>
          </button>
          {/* OSINT / Recon Panel Slideout */}
          <AnimatePresence>
            {showIntel && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <OsintPanel onSweepVisualize={setSweepData} onScanGeolocate={(target, data) => {
                  setScanTargets(prev => {
                    const existing = prev.filter(t => t.id !== target);
                    return [{ id: target, timestamp: Date.now(), ...data }, ...existing].slice(0, 10);
                  });
                  setFlyToLocation({ lat: data.lat, lng: data.lng, ts: Date.now() });
                }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowMarkets(!showMarkets); setShowNews(false); setShowIntel(false); setShowAlerts(false); setShowFusion(false); }} className={`ophanim-context-button ${showMarkets ? 'is-active' : ''}`} title="Markets">
            <BarChart3 className={`w-4 h-4 ${showMarkets ? 'text-[var(--gold-primary)]' : 'text-white/60'}`} />
            <span>Markets</span>
          </button>
          {/* Markets Panel Slideout */}
          <AnimatePresence>
            {showMarkets && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <MarketsPanel data={data} spaceWeather={spaceWeather} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowAlerts(!showAlerts); setShowNews(false); setShowIntel(false); setShowMarkets(false); setShowEntityGraph(false); setShowFusion(false); }} className={`ophanim-context-button ${showAlerts ? 'is-active is-alert' : ''}`} title="Live alerts">
            <AlertTriangle className={`w-4 h-4 ${showAlerts ? 'text-[#FF3D3D]' : 'text-white/60'}`} />
            <span>Alerts</span>
          </button>
          {/* Alerts Panel Slideout */}
          <AnimatePresence>
            {showAlerts && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <LiveAlerts data={data} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} onWatchFeed={(url, name) => { setLiveFeedUrl(url); setLiveFeedName(name); }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowEntityGraph(!showEntityGraph); setShowNews(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); }} className={`ophanim-context-button ${showEntityGraph ? 'is-active' : ''}`} title="Entity graph">
            <Network className={`w-4 h-4 ${showEntityGraph ? 'text-[var(--gold-primary)]' : 'text-white/60'}`} />
            <span>Entities</span>
          </button>
        </div>

        <div className="relative group">
          <button onClick={() => window.location.assign('/imports')} className="ophanim-context-button" title="Import organization data">
            <FileUp className="w-4 h-4 text-white/60" />
            <span>Import</span>
          </button>
        </div>

        <div className="relative group">
          <button onClick={() => { setShowDesktopSearch(!showDesktopSearch); setShowNews(false); setShowIntel(false); setShowMarkets(false); setShowAlerts(false); setShowEntityGraph(false); }} className={`ophanim-context-button ${showDesktopSearch ? 'is-active' : ''}`} title="Search tools">
            <Search className={`w-4 h-4 ${showDesktopSearch ? 'text-[var(--gold-primary)]' : 'text-white/60'}`} />
            <span>Search</span>
          </button>
          <AnimatePresence>
            {showDesktopSearch && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute right-12 top-1/2 -translate-y-1/2 w-80">
                <SearchBar
                  alwaysExpanded
                  onLocate={(lat, lng, zoom) => { setFlyToLocation({ lat, lng, zoom, ts: Date.now() }); setShowDesktopSearch(false); }}
                  onAction={(action) => {
                    if (action.type !== 'enable_layers') return;
                    setActiveLayers((previous) => ({ ...previous, ...Object.fromEntries(action.layers.map((layer) => [layer, true])) }));
                    setShowDesktopSearch(false);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>


      </div>}

      {/* ── LIVE FEED VIEWER OVERLAY ── */}
      <AnimatePresence>
        {liveFeedUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setLiveFeedUrl(null)}
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="w-[90vw] max-w-[900px] flex flex-col relative rounded-xl overflow-hidden border border-[var(--border-primary)] shadow-2xl bg-black"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#111] border-b border-[var(--border-primary)]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#FF4081] animate-ophanim-pulse" />
                  <span className="text-[12px] font-mono font-bold text-white tracking-wider">{liveFeedName}</span>
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-mono text-[9px] font-bold">LIVE STREAM</span>
                  {!liveFeedEmbedAllowed && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono text-[9px]">EXTERNAL ONLY</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={getYouTubeWatchUrl(liveFeedUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--border-primary)] hover:bg-[var(--gold-primary)] hover:text-black text-white transition-colors text-[11px] font-mono"
                  >
                    <span>Open in YouTube</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button onClick={() => setLiveFeedUrl(null)} className="text-white/70 hover:text-white transition-colors p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body — iframe or external card */}
              {liveFeedEmbedAllowed ? (
                <div className="w-full aspect-video relative bg-black">
                  <iframe
                    src={liveFeedUrl}
                    className="w-full h-full absolute inset-0"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="w-full aspect-video flex items-center justify-center bg-black/95">
                  <div className="text-center px-8">
                    <div className="w-14 h-14 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center mx-auto mb-4">
                      <ExternalLink className="w-6 h-6 text-[#39FF14]" />
                    </div>
                    <p className="text-[13px] font-mono font-bold text-white tracking-widest mb-2">EMBED RESTRICTED</p>
                    <p className="text-[11px] font-mono text-white/50 mb-6 max-w-xs">
                      {liveFeedName} does not allow third-party embedding. Click below to open the live stream directly.
                    </p>
                    <a
                      href={getYouTubeWatchUrl(liveFeedUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded border border-[#39FF14]/40 text-[#39FF14] font-mono text-[12px] hover:bg-[#39FF14]/10 transition-colors tracking-wider"
                    >
                      <ExternalLink className="w-4 h-4" />
                      OPEN LIVE STREAM
                    </a>
                  </div>
                </div>
              )}

              {/* Footer — only show for embeddable feeds */}
              {liveFeedEmbedAllowed && (
                <div className="bg-[#111]/90 px-4 py-2.5 border-t border-[var(--border-primary)] flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[var(--gold-primary)] shrink-0" />
                  <span className="text-[11px] font-mono text-white/70 leading-relaxed">
                    If you see &ldquo;Video unavailable&rdquo;, use <strong className="text-[var(--gold-primary)]">Open in YouTube</strong> above.
                  </span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MOBILE UI ═══ */}
      {isMobile && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }} className="absolute top-3 right-3 z-[200] pointer-events-auto flex items-center gap-2">
        </motion.div>
      )}
      {isMobile && (
        <>
          {/* Mobile Bottom Navigation */}
          <div className="mobile-nav">
            <div className="glass-panel mobile-nav-inner">
              {[
                { id: 'layers' as const, icon: Layers, label: 'LAYERS' },
                { id: 'markets' as const, icon: BarChart3, label: 'MARKETS' },
                { id: 'intel' as const, icon: Newspaper, label: 'INTEL' },
                { id: 'recon' as const, icon: Radar, label: 'RECON' },
                { id: 'search' as const, icon: Search, label: 'SEARCH' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setMobilePanel(mobilePanel === tab.id ? null : tab.id)}
                  className={`mobile-nav-btn ${mobilePanel === tab.id ? 'active' : ''}`}>
                  <tab.icon className={`w-4 h-4 ${tab.id === 'recon' ? 'text-[var(--cyan-primary)]' : ''}`} />
                  <span className={tab.id === 'recon' ? 'text-[var(--cyan-primary)]' : ''}>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Drawer */}
          <AnimatePresence>
            {mobilePanel && (
              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-[52px] left-0 right-0 z-[400] glass-panel rounded-b-none overflow-y-auto styled-scrollbar"
                style={{ maxHeight: 'min(55vh, calc(100dvh - 100px))', paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}
              >
                <div className="mobile-drawer-handle" />
                <div className="px-3 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="hud-text text-[9px] text-[var(--text-primary)]">
                      {mobilePanel === 'layers' ? 'LAYERS & STATS' : mobilePanel === 'markets' ? 'MARKETS & INTEL' : mobilePanel === 'intel' ? 'INTEL FEED' : mobilePanel === 'recon' ? 'OPHANIM RECON' : 'SEARCH'}
                    </span>
                    <button onClick={() => setMobilePanel(null)} className="text-[var(--text-muted)] p-1"><X className="w-4 h-4" /></button>
                  </div>
                  {mobilePanel === 'layers' && (
                    <>
                      <div className="glass-panel-sm p-2 mb-2">
                        <div className="grid grid-cols-5 gap-1 text-center">
                          <div><div className="hud-label" style={{fontSize:'6px'}}>AIR</div><div className="hud-value text-[9px]">{totalFlights.toLocaleString()}</div></div>
                          <div><div className="hud-label" style={{fontSize:'6px'}}>SAT</div><div className="hud-value text-[9px]">{(data.satellites?.length||0)}</div></div>
                          <div><div className="hud-label" style={{fontSize:'6px'}}>CAM</div><div className="hud-value text-[9px]">{(data.cameras?.length||0)}</div></div>
                          <div><div className="hud-label" style={{fontSize:'6px'}}>WX</div><div className="hud-value text-[9px]" style={{color:'var(--accent-weather)'}}>{(data.weather_events?.length||0)}</div></div>
                          <div><div className="hud-label" style={{fontSize:'6px'}}>NUC</div><div className="hud-value text-[9px]" style={{color:'var(--accent-nuclear)'}}>{(data.infrastructure?.length||0)}</div></div>
                        </div>
                      </div>
                      <LayerPanel data={data} activeLayers={activeLayers} setActiveLayers={setActiveLayers} isMobile={true} theme={ophanimTheme} setTheme={setOphanimTheme} />
                      <div className="mt-8">
                        <ViewPresets onNavigate={(lat, lng, zoom) => { setFlyToLocation({ lat, lng, ts: Date.now() }); setMapView(v => ({ ...v, zoom })); setMobilePanel(null); }} />
                      </div>
                    </>
                  )}
                  {mobilePanel === 'markets' && <MarketsPanel data={data} spaceWeather={spaceWeather} />}
                  {mobilePanel === 'intel' && <IntelFeed data={data} onLocate={(lat, lng) => { setFlyToLocation({ lat, lng, ts: Date.now() }); setMobilePanel(null); }} />}
                  {mobilePanel === 'search' && (
                    <div className="space-y-2">
                      <SearchBar
                        onLocate={(lat, lng, zoom) => { setFlyToLocation({ lat, lng, zoom, ts: Date.now() }); setMobilePanel(null); }}
                        onAction={(action) => {
                          if (action.type !== 'enable_layers') return;
                          setActiveLayers((previous) => ({ ...previous, ...Object.fromEntries(action.layers.map((layer) => [layer, true])) }));
                          setMobilePanel(null);
                        }}
                      />
                      <SharePanel mapView={mapView} activeLayers={activeLayers} mouseCoords={null} />
                    </div>
                  )}
                  {mobilePanel === 'recon' && (
                    <div className="space-y-2">
                      <OsintPanel isOpen={true} onClose={() => setMobilePanel(null)} isMobile={true} onSweepVisualize={setSweepData} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── BOTTOM RAW METRICS (desktop) ── */}
      {!isMobile && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3, duration: 0.8 }} className="desktop-only absolute bottom-8 z-[200] pointer-events-auto" style={{ left: '72px' }}>
          <div className="flex items-center gap-6 text-[8px] font-mono tracking-widest text-[var(--text-muted)] opacity-60">
            <div className="flex gap-2 items-center">
              <span>COORD</span>
              <span ref={coordsDisplayRef} className="text-[var(--gold-primary)] font-bold tabular-nums">—</span>
            </div>
            <div className="flex gap-2 items-center">
              <span>LOC</span>
              <span className="text-[var(--cyan-primary)] truncate max-w-[200px]">{locationLabel || 'HOVER MAP'}</span>
            </div>
            <div className="flex gap-2 items-center">
              <span>Z</span>
              <span className="text-[var(--gold-primary)] font-bold tabular-nums">{mapView.zoom.toFixed(1)}</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Scale Bar (desktop) ── */}
      <div className="desktop-only absolute bottom-[4.5rem] left-[12rem] z-[201] pointer-events-none">
        <ScaleBar zoom={mapView.zoom} latitude={mapView.latitude} />
      </div>

      {/* ── Region Dossier ── */}
      {(regionDossier || dossierLoading) && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute top-16 md:top-20 left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 z-[300] md:w-[480px] max-h-[65vh] overflow-y-auto styled-scrollbar">
          <div className="glass-panel p-5 ophanim-glow">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono font-bold text-[var(--gold-primary)] tracking-wider">REGION DOSSIER</h2>
              <button onClick={() => { setRegionDossier(null); setDossierLoading(false); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">✕</button>
            </div>
            {dossierLoading ? (
              <div className="text-center py-8">
                <div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span className="text-[8px] font-mono text-[var(--text-muted)] tracking-widest">COMPILING INTEL...</span>
              </div>
            ) : regionDossier && (
              <div className="space-y-3">
                <div><div className="hud-label mb-0.5">LOCATION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.location?.display_name}</div></div>
                {regionDossier.country && (
                  <div className="grid grid-cols-2 gap-2">
                    <div><div className="hud-label mb-0.5">COUNTRY</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.flag} {regionDossier.country.name}</div></div>
                    <div><div className="hud-label mb-0.5">CAPITAL</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.capital}</div></div>
                    <div><div className="hud-label mb-0.5">POPULATION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.population?.toLocaleString()}</div></div>
                    <div><div className="hud-label mb-0.5">REGION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.subregion || regionDossier.country.region}</div></div>
                    <div><div className="hud-label mb-0.5">LANGUAGES</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.languages?.join(', ')}</div></div>
                    <div><div className="hud-label mb-0.5">AREA</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.area?.toLocaleString()} km²</div></div>
                  </div>
                )}
                {regionDossier.head_of_state && (<div><div className="hud-label mb-0.5">HEAD OF STATE</div><div className="text-xs text-[var(--gold-primary)]">{regionDossier.head_of_state.name}</div><div className="text-[8px] text-[var(--text-muted)]">{regionDossier.head_of_state.position}</div></div>)}
                {regionDossier.wikipedia && (<div><div className="hud-label mb-1">INTELLIGENCE BRIEF</div><div className="flex gap-3">{regionDossier.wikipedia.thumbnail && <img src={regionDossier.wikipedia.thumbnail} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />}<p className="text-[8px] text-[var(--text-secondary)] leading-relaxed">{regionDossier.wikipedia.extract}</p></div></div>)}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Camera Viewer ── */}
      <CameraViewer
        camera={activeCamera}
        onClose={() => setActiveCamera(null)}
        onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })}
      />

      {/* ── Entity Graph Panel ── */}
      {showEntityGraph && (
        <EntityGraphPanel
          entity={entityGraphTarget}
          onClose={() => setShowEntityGraph(false)}
        />
      )}

      {/* ── OVERLAYS ── */}
      <div className="vignette absolute inset-0 pointer-events-none z-[2]" />
      <div className="crt-scanlines absolute inset-0 pointer-events-none z-[3] opacity-[0.02]" />
      {/* Corner frames — using explicit classes for Tailwind JIT compatibility */}
      {[
        { pos: 'top-0 left-0', vAnchor: 'top-0', hAnchor: 'left-0', hGrad: 'bg-gradient-to-r', vGrad: 'bg-gradient-to-b' },
        { pos: 'top-0 right-0', vAnchor: 'top-0', hAnchor: 'right-0', hGrad: 'bg-gradient-to-l', vGrad: 'bg-gradient-to-b' },
        { pos: 'bottom-0 left-0', vAnchor: 'bottom-0', hAnchor: 'left-0', hGrad: 'bg-gradient-to-r', vGrad: 'bg-gradient-to-t' },
        { pos: 'bottom-0 right-0', vAnchor: 'bottom-0', hAnchor: 'right-0', hGrad: 'bg-gradient-to-l', vGrad: 'bg-gradient-to-t' },
      ].map((c, i) => (
        <div key={i} className={`absolute ${c.pos} w-16 h-16 pointer-events-none z-[1]`}>
          <div className={`absolute ${c.vAnchor} ${c.hAnchor} w-full h-[1px] ${c.hGrad} from-[var(--gold-primary)]/30 to-transparent`} />
          <div className={`absolute ${c.vAnchor} ${c.hAnchor} w-[1px] h-full ${c.vGrad} from-[var(--gold-primary)]/30 to-transparent`} />
        </div>
      ))}

      {/* Command Palette (⌘K / Ctrl+K) */}
      <CommandPalette commands={paletteCommands} />

      {/* Keyboard Shortcuts Overlay */}
      <KeyboardShortcuts />

      {/* ── GLOBAL STATUS TICKER (bottom) ── */}
      <GlobalStatusBar onThreatClick={() => { closeRightPanels(); setShowFusion(true); }} />

      {/* Shortcut hint */}
      <div className="desktop-only absolute bottom-[26px] right-5 z-[200] pointer-events-none text-[6px] font-mono text-[var(--text-muted)]/40 tracking-widest">
        [⌘K] COMMAND / [?] SHORTCUTS / [F] FULLSCREEN / [S] SHARE / [R] RESET VIEW
      </div>


    </main>
  );
}
