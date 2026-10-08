'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, ChevronDown, ChevronUp, ExternalLink, MapPin, Zap, Download, CheckCheck } from 'lucide-react';
import { filterNews, newsCsv, NEWS_WINDOWS, safeSourceUrl, type NewsItem } from '@/lib/intelligence/news';
import { useReadNews } from '@/components/intelligence/useReadNews';
import styles from '@/components/intelligence/desk.module.css';

/* ═══════════════════════════════════════════════════════════════
   OPHANIM — Intelligence Feed
   SIGINT-style news aggregation with risk scoring
   ═══════════════════════════════════════════════════════════════ */

interface IntelFeedProps {
  data: { news?: NewsItem[] };
  onLocate?: (lat: number, lng: number) => void;
  variant?: 'panel' | 'workbench';
}

function getRiskClass(score: number): string {
  if (score >= 8) return 'risk-critical';
  if (score >= 6) return 'risk-high';
  if (score >= 4) return 'risk-medium';
  return 'risk-low';
}

function getRiskLabel(score: number): string {
  if (score >= 8) return 'CRITICAL';
  if (score >= 6) return 'HIGH';
  if (score >= 4) return 'ELEVATED';
  return 'LOW';
}

function timeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    if (!Number.isFinite(diff)) return 'Date unavailable';
    if (diff < 60000) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return '';
  }
}

export default function IntelFeed({ data, onLocate, variant = 'panel' }: IntelFeedProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [hours, setHours] = useState(0);
  const [minRisk, setMinRisk] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [limit, setLimit] = useState(25);
  const { seen, markRead } = useReadNews();
  const news: NewsItem[] = data.news || [];
  const filtered = filterNews(news, { query, source, hours, minRisk, unreadOnly, seen });
  const sources = [...new Set(news.map((item) => item.source))].sort();
  const exportNews = (format: 'csv' | 'json') => {
    const blob = new Blob([format === 'csv' ? newsCsv(filtered) : JSON.stringify(filtered, null, 2)],
      { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ophanim-news.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6, duration: 0.6 }}
      className={`${variant === 'workbench' ? 'ophanim-intel-feed--workbench' : 'glass-panel'} flex flex-col overflow-hidden pointer-events-auto`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-4 py-3 hover:bg-[var(--hover-accent)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Newspaper className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="hud-text text-[12px] text-[var(--text-primary)]">SIGINT FEED</span>
          <span className="gotham-tag gotham-tag--info" style={{ fontSize: '8px', padding: '1px 5px' }}>{news.length}</span>
          {news.some((n) => n.risk_score >= 8) && (
            <span className="gotham-tag gotham-tag--critical" style={{ fontSize: '7px', padding: '1px 4px' }}>ALERTS</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-ophanim-pulse" />
          {expanded ? <ChevronUp className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />}
        </div>
      </button>

      {/* News Items */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className={styles.toolbar}>
              <input type="search" aria-label="Search news" placeholder="Search news" value={query} onChange={(event) => setQuery(event.target.value)} />
              <select aria-label="News source" value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="">All sources</option>
                {sources.map((name) => <option key={name}>{name}</option>)}
              </select>
              <select aria-label="News time window" value={hours} onChange={(event) => setHours(Number(event.target.value))}>
                <option value={0}>All loaded news</option>
                {NEWS_WINDOWS.map((hours) => <option key={hours} value={hours}>Last {hours === 168 ? '7 days' : `${hours} hours`}</option>)}
              </select>
              <select aria-label="News risk filter" value={minRisk} onChange={(event) => setMinRisk(Number(event.target.value))}>
                <option value={0}>All keyword scores</option><option value={4}>Elevated+</option><option value={6}>High+</option><option value={8}>Critical</option>
              </select>
              <label><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />Unread</label>
              <button type="button" title="Mark filtered news as read" aria-label="Mark filtered news as read" disabled={!filtered.length} onClick={() => markRead(filtered.map((item) => item.id))}><CheckCheck size={16} /></button>
              <button type="button" title="Export filtered news as CSV" onClick={() => exportNews('csv')}><Download size={14} />CSV</button>
              <button type="button" title="Export filtered news as JSON" onClick={() => exportNews('json')}><Download size={14} />JSON</button>
            </div>
            <div className={styles.count}>{filtered.length} of {news.length} items</div>
            <div className={`${variant === 'workbench' ? 'ophanim-intel-feed--workbench__items' : 'max-h-[400px] divide-y'} overflow-y-auto styled-scrollbar divide-[var(--border-secondary)]`}>
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <span className="text-[11px] font-mono text-[var(--text-muted)] tracking-widest">
                    {news.length ? 'No news matches these filters.' : 'No news loaded yet.'}
                  </span>
                </div>
              ) : (
                filtered.slice(0, limit).map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={`px-4 py-2.5 hover:bg-[var(--hover-accent)] transition-colors cursor-pointer ${seen.has(item.id) ? '' : styles.unread}`}
                    onClick={() => { markRead([item.id]); const link = safeSourceUrl(item.link); if (link) window.open(link, '_blank', 'noopener,noreferrer'); else setSelectedIdx(selectedIdx === item.id ? null : item.id); }}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') { markRead([item.id]); const link = safeSourceUrl(item.link); if (link) window.open(link, '_blank', 'noopener,noreferrer'); } }}
                  >
                    {/* Top row: risk badge + source + time */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-mono font-bold tracking-widest ${getRiskClass(item.risk_score)}`}>
                        {getRiskLabel(item.risk_score)}
                      </span>
                      <span className="text-[8px] font-mono text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                        {item.source}
                      </span>
                      {item.coords && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.coords) onLocate?.(item.coords[0], item.coords[1]);
                          }}
                          className="text-[var(--text-muted)] hover:text-[var(--cyan-primary)] transition-colors"
                          title={item.location_precision === 'reported' ? 'Show reported location' : 'Show approximate location'}
                          aria-label="Locate news on map"
                        >
                          <MapPin className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <span className="text-[8px] font-mono text-[var(--text-muted)] ml-auto">
                        {item.published ? timeAgo(item.published) : 'Date unavailable'}
                      </span>
                    </div>

                    {/* Title */}
                    <h4 className="text-[11px] text-[var(--text-primary)] leading-tight line-clamp-2">
                      {item.title}
                    </h4>

                    {/* Machine Assessment (if critical) */}
                    {item.machine_assessment && (
                      <div className="mt-1.5 flex items-start gap-1.5 bg-red-950/20 border border-red-900/20 rounded px-2 py-1">
                        <Zap className="w-2.5 h-2.5 text-red-400 flex-shrink-0 mt-0.5" />
                        <span className="text-[9px] font-mono text-red-400/80 leading-relaxed">
                          {item.machine_assessment}
                        </span>
                      </div>
                    )}

                    {/* Expanded details */}
                    <AnimatePresence>
                      {selectedIdx === item.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-2 overflow-hidden"
                        >
                          <a
                            href={safeSourceUrl(item.link)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] font-mono text-[var(--cyan-primary)] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            OPEN SOURCE
                          </a>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
            {filtered.length > limit && <div className={styles.toolbar}><button type="button" onClick={() => setLimit((value) => value + 25)}>Load more</button></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
