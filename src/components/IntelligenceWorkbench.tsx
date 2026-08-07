'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Bell,
  BookmarkPlus,
  ChevronDown,
  MapPinned,
  Newspaper,
  Plus,
  Radio,
  Target,
  X,
} from 'lucide-react';
import IntelFeed from '@/components/IntelFeed';
import LiveAlerts from '@/components/LiveAlerts';

export type IntelligenceWorkbenchView = 'news' | 'alerts' | 'signals';

type MonitorTab = {
  id: string;
  entityType: string;
  value: string;
};

type IntelligenceWorkbenchProps = {
  data: any;
  open: boolean;
  view: IntelligenceWorkbenchView;
  onViewChange: (view: IntelligenceWorkbenchView) => void;
  onClose: () => void;
  onLocate: (lat: number, lng: number) => void;
  onWatchTarget: (target: { type: string; value: string }) => void;
};

const monitorEntityTypes = ['ip', 'domain', 'ship', 'port', 'company', 'threat_actor', 'region', 'country'];

function signalsFor(data: any) {
  return [
    { label: 'News items', value: Array.isArray(data.news) ? data.news.length : 0, tone: 'cyan' },
    { label: 'Active incidents', value: Array.isArray(data.gdelt) ? data.gdelt.length : 0, tone: 'rose' },
    { label: 'Vessels', value: Array.isArray(data.maritime_ships) ? data.maritime_ships.length : 0, tone: 'blue' },
    { label: 'Cyber indicators', value: Array.isArray(data.cyberThreats) ? data.cyberThreats.length : 0, tone: 'amber' },
  ];
}

export default function IntelligenceWorkbench({
  data,
  open,
  view,
  onViewChange,
  onClose,
  onLocate,
  onWatchTarget,
}: IntelligenceWorkbenchProps) {
  const [tabs, setTabs] = useState<MonitorTab[]>([]);
  const [activeTab, setActiveTab] = useState('map');
  const [showCreate, setShowCreate] = useState(false);
  const [entityType, setEntityType] = useState('domain');
  const [entityValue, setEntityValue] = useState('');
  const activeTarget = tabs.find((tab) => tab.id === activeTab) ?? null;
  const signals = useMemo(() => signalsFor(data), [data]);
  const relatedNews = useMemo(() => {
    if (!activeTarget || !Array.isArray(data.news)) return [];
    const needle = activeTarget.value.toLowerCase();
    return data.news.filter((item: any) => `${item.title ?? ''} ${item.summary ?? ''}`.toLowerCase().includes(needle)).slice(0, 4);
  }, [activeTarget, data.news]);

  const createMonitor = () => {
    const value = entityValue.trim();
    if (!value) return;
    const id = `${entityType}:${value.toLowerCase()}`;
    if (!tabs.some((tab) => tab.id === id)) {
      setTabs((current) => [...current, { id, entityType, value }]);
    }
    setActiveTab(id);
    setEntityValue('');
    setShowCreate(false);
  };

  const removeTarget = (id: string) => {
    setTabs((current) => current.filter((tab) => tab.id !== id));
    setActiveTab('map');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 36 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          aria-label="Intelligence workbench"
          className="ophanim-workbench fixed inset-x-3 bottom-[62px] z-[330] mx-auto flex max-h-[min(590px,58dvh)] w-[min(1180px,calc(100vw-24px))] flex-col overflow-hidden md:bottom-[62px]"
        >
          <header className="ophanim-workbench__header">
            <div className="ophanim-workbench__title">
              <Radio className="h-4 w-4 text-[var(--cyan-primary)]" />
              <span>INTELLIGENCE WORKBENCH</span>
            </div>

            <div className="ophanim-workbench__tabs" role="tablist" aria-label="Workspace tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'map'}
                onClick={() => setActiveTab('map')}
                className={`ophanim-workbench__tab ${activeTab === 'map' ? 'is-active' : ''}`}
              >
                <MapPinned className="h-3.5 w-3.5" />
                MAP
              </button>
              {tabs.map((tab) => (
                <div key={tab.id} className={`ophanim-workbench__target-tab ${activeTab === tab.id ? 'is-active' : ''}`}>
                  <button type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                    <Target className="h-3.5 w-3.5" />
                    <span>{tab.value}</span>
                  </button>
                  <button type="button" title={`Close ${tab.value}`} onClick={() => removeTarget(tab.id)}><X className="h-3 w-3" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setShowCreate((current) => !current)} className="ophanim-workbench__new-tab" title="Create a target monitor tab">
                <Plus className="h-3.5 w-3.5" />
                NEW TARGET
              </button>
            </div>

            <button type="button" onClick={onClose} title="Close intelligence workbench" className="ophanim-workbench__close"><ChevronDown className="h-4 w-4" /></button>
          </header>

          {showCreate && (
            <div className="ophanim-workbench__create">
              <Target className="h-4 w-4 text-[var(--cyan-primary)]" />
              <select value={entityType} onChange={(event) => setEntityType(event.target.value)} aria-label="Target type">
                {monitorEntityTypes.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
              </select>
              <input
                value={entityValue}
                onChange={(event) => setEntityValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') createMonitor(); }}
                placeholder="Target to monitor"
                aria-label="Target to monitor"
              />
              <button type="button" onClick={createMonitor}>OPEN TAB</button>
            </div>
          )}

          <div className="ophanim-workbench__body styled-scrollbar">
            {activeTarget ? (
              <section className="ophanim-target-monitor">
                <div className="ophanim-target-monitor__identity">
                  <span className="ophanim-target-monitor__type">{activeTarget.entityType.replace('_', ' ')}</span>
                  <h2>{activeTarget.value}</h2>
                  <p>Focused monitoring workspace. Add this target to persistent watchlists to receive notifications.</p>
                  <button type="button" onClick={() => onWatchTarget({ type: activeTarget.entityType, value: activeTarget.value })}>
                    <BookmarkPlus className="h-4 w-4" />
                    SAVE TO WATCHLIST
                  </button>
                </div>
                <div className="ophanim-target-monitor__evidence">
                  <div className="ophanim-workbench__section-label">RELATED INTELLIGENCE</div>
                  {relatedNews.length === 0 ? (
                    <p className="ophanim-workbench__empty">No matching news is loaded yet. The target remains ready for watchlist monitoring.</p>
                  ) : relatedNews.map((item: any, index: number) => (
                    <a key={`${item.link ?? item.title}-${index}`} href={item.link} target="_blank" rel="noopener noreferrer" className="ophanim-target-monitor__news">
                      <span>{item.source ?? 'SOURCE'}</span>
                      <strong>{item.title}</strong>
                    </a>
                  ))}
                </div>
              </section>
            ) : (
              <>
                <div className="ophanim-workbench__views" role="tablist" aria-label="Workbench views">
                  <button type="button" role="tab" aria-selected={view === 'news'} onClick={() => onViewChange('news')} className={view === 'news' ? 'is-active' : ''}><Newspaper className="h-3.5 w-3.5" /> NEWS</button>
                  <button type="button" role="tab" aria-selected={view === 'alerts'} onClick={() => onViewChange('alerts')} className={view === 'alerts' ? 'is-active' : ''}><Bell className="h-3.5 w-3.5" /> ALERTS</button>
                  <button type="button" role="tab" aria-selected={view === 'signals'} onClick={() => onViewChange('signals')} className={view === 'signals' ? 'is-active' : ''}><Activity className="h-3.5 w-3.5" /> SIGNALS</button>
                </div>
                {view === 'news' && <IntelFeed data={data} onLocate={onLocate} variant="workbench" />}
                {view === 'alerts' && <LiveAlerts data={data} onLocate={onLocate} />}
                {view === 'signals' && (
                  <section className="ophanim-signal-grid" aria-label="Live signal overview">
                    {signals.map((signal) => (
                      <article key={signal.label} className={`ophanim-signal-grid__item is-${signal.tone}`}>
                        <span>{signal.label}</span>
                        <strong>{signal.value.toLocaleString()}</strong>
                        <small>Loaded in this workspace</small>
                      </article>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
