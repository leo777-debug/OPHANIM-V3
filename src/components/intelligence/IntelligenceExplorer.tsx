'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { buildTimeline, filterNews, NEWS_WINDOWS, regionalCoverage, safeSourceUrl, type FeedHealth, type NewsItem } from '@/lib/intelligence/news';
import styles from './desk.module.css';

export type ExplorerView = 'timeline' | 'regions' | 'sources' | 'clocks';
export type ExplorerData = { news?: NewsItem[]; earthquakes?: Parameters<typeof buildTimeline>[1]; news_sources?: FeedHealth[] };
type Props = {
  view: ExplorerView;
  data: ExplorerData;
  onLocate: (lat: number, lng: number) => void;
};

const CLOCKS = [
  ['UTC', 'UTC'], ['New York', 'America/New_York'], ['London', 'Europe/London'],
  ['Dubai', 'Asia/Dubai'], ['Singapore', 'Asia/Singapore'], ['Tokyo', 'Asia/Tokyo'],
] as const;

function WorldClocks() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <section className={styles.grid} aria-label="World clocks">
    {CLOCKS.map(([name, timeZone]) => <div key={timeZone} className={styles.clock}>
      <span>{name}</span>
      <strong>{now ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now) : '--:--:--'}</strong>
      <span>{now ? new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: 'short' }).format(now) : timeZone}</span>
    </div>)}
  </section>;
}

export default function IntelligenceExplorer({ view, data, onLocate }: Props) {
  const [hours, setHours] = useState(24);
  const [kind, setKind] = useState('all');
  if (view === 'clocks') return <WorldClocks />;
  if (view === 'sources') {
    const sources = data.news_sources ?? [];
    return <div className={styles.scroll}>
      {!sources.length ? <p className={styles.empty}>Source health is not available yet.</p> : <table className={styles.table}>
        <thead><tr><th>Source</th><th>Status</th><th>Items</th><th>Latest publication (UTC)</th><th>Checked (UTC)</th></tr></thead>
        <tbody>{sources.map((source) => <tr key={source.name}>
          <td><a href={safeSourceUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.name}</a></td>
          <td>{source.status === 'ok' ? 'Available' : source.status === 'empty' ? 'No items' : 'Unavailable'}</td>
          <td>{source.count}</td><td>{source.latestPublished ?? 'Unknown'}</td><td>{source.checkedAt}</td>
        </tr>)}</tbody>
      </table>}
    </div>;
  }
  const news = filterNews(data.news ?? [], { hours });
  const regions = regionalCoverage(news);
  const timeline = buildTimeline(data.news ?? [], data.earthquakes ?? [], hours)
    .filter((event) => kind === 'all' || event.kind === kind);
  return <section aria-label={view === 'timeline' ? 'Event timeline' : 'Regional coverage'}>
    <div className={styles.toolbar}>
      <select aria-label="Intelligence time window" value={hours} onChange={(event) => setHours(Number(event.target.value))}>
        {NEWS_WINDOWS.map((value) => <option key={value} value={value}>Last {value === 168 ? '7 days' : `${value} hours`}</option>)}
      </select>
      {view === 'timeline' && <select aria-label="Timeline event type" value={kind} onChange={(event) => setKind(event.target.value)}>
        <option value="all">All event types</option><option value="news">News</option><option value="earthquake">Earthquakes</option>
      </select>}
      <span className={styles.meta}>{view === 'timeline' ? `${timeline.length} events` : `${regions.length} regions`}</span>
    </div>
    {view === 'timeline' ? <>
      {!timeline.length && <p className={styles.empty}>No dated events in this time window.</p>}
      <ol className={styles.list}>{timeline.slice(0, 200).map((event) => <li key={event.id} className={styles.event}>
        <time dateTime={new Date(event.time).toISOString()}>{new Date(event.time).toISOString().replace('T', ' ').slice(0, 16)} UTC</time>
        <div><span className={styles.meta}>{event.source} / {event.kind}</span>
          <strong>{event.link ? <a href={event.link} target="_blank" rel="noopener noreferrer">{event.title}</a> : event.title}</strong>
        </div>
        {event.coords && <button type="button" title="Locate on map" aria-label={`Locate ${event.title}`} onClick={() => onLocate(...event.coords!)}><MapPin size={16} /></button>}
      </li>)}</ol>
    </> : <>
      <p className={styles.count}>Country/region mentions, not verified incident counts. Map locations are approximate.</p>
      {!regions.length && <p className={styles.empty}>No region-tagged news in this time window.</p>}
      <ul className={styles.list}>{regions.map((region) => <li key={region.name} className={styles.event}>
        <strong style={{ textTransform: 'capitalize' }}>{region.name}</strong>
        <div><strong>{region.count} reports / {region.sources.size} sources</strong><span className={styles.meta}>{[...region.sources].join(', ')}</span></div>
        <button type="button" title="Show approximate region" aria-label={`Locate ${region.name}`} onClick={() => onLocate(...region.coords)}><MapPin size={16} /></button>
      </li>)}</ul>
    </>}
  </section>;
}
