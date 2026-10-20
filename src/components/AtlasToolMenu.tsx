'use client';

import { useEffect, useRef } from 'react';
import { Activity, BarChart3, Bell, Brain, Crosshair, Globe2, Network, Radar, Search, Ship, Wrench, Newspaper, Settings, Bookmark, Database } from 'lucide-react';
import { ATLAS_TOOLS, type AtlasTool } from '@/lib/atlas-tools';
import styles from './intelligence-tools.module.css';

const icons = { analyst: Brain, fusion: Activity, recon: Radar, markets: BarChart3, alerts: Bell, entities: Network, search: Search, shodan: Globe2, ip: Crosshair, tracking: Ship, news:Newspaper, settings:Settings, watchlists:Bookmark, sources:Database, logistics:Ship };

export default function AtlasToolMenu({ onChoose }: { onChoose: (tool: AtlasTool) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current) ref.current.open = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, []);
  return <details ref={ref} className={styles.tools}>
    <summary title="Intelligence tools"><Wrench size={17} /><span>Intelligence tools</span></summary>
    <nav aria-label="Intelligence tools" className={styles.list}>
      {ATLAS_TOOLS.map(tool => {
        const Icon = icons[tool.id];
        return <button key={tool.id} type="button" onClick={() => { if (ref.current) ref.current.open = false; onChoose(tool.id); }}>
          <Icon size={18} /><span>{tool.label}<small>{tool.description}</small></span>
        </button>;
      })}
    </nav>
  </details>;
}
