'use client';

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, X } from 'lucide-react';
import AtlasToolMenu from '@/components/AtlasToolMenu';
import FullscreenButton from '@/components/FullscreenButton';
import { atlasToolHref, type AtlasTool } from '@/lib/atlas-tools';
import { DEFAULT_PRESENTATION, type PresentationSettings, type PresentationView } from '@/lib/presentation/types';
import styles from './presentation.module.css';

type Controls = { settings: PresentationSettings; switchView: (view: PresentationView) => void; openTool: (tool: AtlasTool) => void; openPage: (href:string)=>void };
const Context = createContext<Controls>({ settings: DEFAULT_PRESENTATION, switchView: () => {}, openTool: () => {}, openPage:()=>{} });
export const usePresentation = () => useContext(Context);

export function IntelligenceTools() {
  const { openTool } = usePresentation();
  return <AtlasToolMenu onChoose={openTool} />;
}

export function PresenterSwitch({ view }: { view: PresentationView }) {
  const { settings, switchView } = usePresentation();
  if (!settings.enabled) return null;
  return <div className={styles.switch} role="group" aria-label="Presentation view">
    <button aria-pressed={view === 'map'} onClick={() => switchView('map')}>Map view</button>
    <button aria-pressed={view === 'full'} onClick={() => switchView('full')}>Full platform</button>
  </div>;
}

export default function PresentationBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [settings, setSettings] = useState(DEFAULT_PRESENTATION);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lastSettings = useRef(DEFAULT_PRESENTATION);
  const pendingDestination = useRef<string | undefined>(undefined);
  const mapPage = pathname === '/presentation' || pathname === '/presentation/preview';

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch('/api/presentation/settings', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const { settings: next }: { settings: PresentationSettings } = await response.json();
        const previous = lastSettings.current;
        lastSettings.current = next;
        setSettings(next);
        if (next.enabled && new URLSearchParams(location.search).get('unlock') === '1') setPinOpen(true);
        if (pathname.startsWith('/admin') || pathname === '/presentation/preview' || (pathname === '/login' && new URLSearchParams(location.search).get('admin') === '1')) return;
        if (!next.enabled) {
          setPinOpen(false);
          if (pathname === '/presentation') router.replace('/');
        } else if (!mapPage && !pathname.startsWith('/verify') && (!previous.enabled || previous.revision !== next.revision)) {
          const viewResponse = await fetch('/api/presentation/view', { cache: 'no-store', signal: controller.signal });
          if (viewResponse.ok && (await viewResponse.json()).view === 'map') router.replace('/presentation');
        }
        if (previous.revision !== next.revision) router.refresh();
      } catch { /* Keep the current page usable during a temporary settings failure. */ }
    }
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('presentation-settings-changed', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('presentation-settings-changed', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [pathname, router, mapPage]);

  const submitSwitch = useCallback(async (view: PresentationView, suppliedPin?: string, destination?: string) => {
    setBusy(true); setError('');
    try {
      if (destination) pendingDestination.current = destination;
      const currentPath = location.pathname + location.search;
      const returnTo = pendingDestination.current ?? (mapPage ? sessionStorage.getItem('ophanim-presenter-return') ?? '/logistics/map' : currentPath);
      const response = await fetch('/api/presentation/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view, pin: suppliedPin, returnTo }) });
      const body = await response.json();
      if (response.status === 401) { setPinOpen(true); if (suppliedPin) setError(body.error); return; }
      if (!response.ok) throw new Error(body.error || 'Could not switch views.');
      if (view === 'map' && !mapPage) sessionStorage.setItem('ophanim-presenter-return', currentPath);
      pendingDestination.current = undefined;
      setPinOpen(false); setPin('');
      router.push(body.href); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not switch views.'); }
    finally { setBusy(false); }
  }, [mapPage, router]);

  const switchView = useCallback((view: PresentationView) => { pendingDestination.current = undefined; void submitSwitch(view); }, [submitSwitch]);
  const openTool = useCallback((tool: AtlasTool) => {
    if (mapPage || pathname === '/logistics/map') {
      const params = new URLSearchParams(location.search);
      params.set('tool',tool);
      window.history.replaceState(null,'',pathname+'?'+params.toString());
      return;
    }
    const href = atlasToolHref(tool);
    if (settings.enabled) void submitSwitch('full', undefined, href);
    else router.push(href);
  }, [router, settings.enabled, submitSwitch, mapPage, pathname]);
  const openPage = useCallback((href:string)=>{
    if (!href.startsWith('/') || href.startsWith('//')) return;
    if (settings.enabled && mapPage) void submitSwitch('full',undefined,href);
    else router.push(href);
  },[router,settings.enabled,mapPage,submitSwitch]);
  const keyboardSwitch = useEffectEvent(() => switchView(location.pathname.startsWith('/presentation') ? 'full' : 'map'));
  useEffect(() => {
    if (!settings.enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyP') { event.preventDefault(); keyboardSwitch(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.enabled]);

  // Keep the page subtree mounted while runtime settings arrive or change.
  // In OFF mode display:contents leaves the normal page layout untouched.
  const content = <div className={settings.enabled?styles.fullPlatform:undefined} style={!settings.enabled?{display:'contents'}:undefined}>
    {settings.enabled&&<header className={styles.presenterBar}>{!mapPage&&<button onClick={() => switchView('map')}><ArrowLeft size={16} />Back to map</button>}<IntelligenceTools />{!mapPage&&pathname!=='/logistics/map'&&<FullscreenButton />}<span>Presentation mode is ON</span><PresenterSwitch view={mapPage?'map':'full'} /></header>}
    <div className={settings.enabled?styles.platformContent:undefined} style={!settings.enabled?{display:'contents'}:undefined}>{children}</div>
  </div>;
  return <Context.Provider value={{ settings, switchView, openTool, openPage }}>{content}
    {settings.enabled && error && !pinOpen && <div className={styles.toast} role="alert">{error}<button aria-label="Dismiss" onClick={() => setError('')}><X size={16} /></button></div>}
    {settings.enabled && pinOpen && <div className={styles.scrim}><form role="dialog" aria-modal="true" aria-labelledby="switch-pin-title" className={styles.dialog} onSubmit={event => { event.preventDefault(); void submitSwitch('full', pin); }}>
      <button type="button" className={styles.close} aria-label="Close PIN dialog" onClick={() => { setPinOpen(false); setPin(''); pendingDestination.current = undefined; }}><X size={20} /></button>
      <h2 id="switch-pin-title">Enter switch PIN</h2><p>Full platform still uses its normal login.</p>
      <label>Switch PIN<input autoFocus required type="password" inputMode="numeric" pattern="[0-9]{4,12}" autoComplete="off" value={pin} onChange={event => setPin(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<button className={styles.primary} disabled={busy}>{busy ? 'Checking...' : 'Open full platform'}</button>
    </form></div>}
  </Context.Provider>;
}
