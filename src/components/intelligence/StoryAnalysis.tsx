'use client';

import { useMemo, useState } from 'react';
import { clusterStories, correlateEntities, detectConvergence, trustFor, whyItMatters, type ConvergenceSignal } from '@/lib/intelligence/analysis';
import { safeSourceUrl, type NewsItem } from '@/lib/intelligence/news';
import type { ExplorerData } from './IntelligenceExplorer';
import styles from './desk.module.css';

const EMPTY_NEWS: NewsItem[] = [];
export default function StoryAnalysis({ data, onLocate }: { data: ExplorerData; onLocate: (lat: number, lng: number) => void }) {
  const [hours, setHours] = useState(36);
  const [similarity, setSimilarity] = useState(0.65);
  const [minimumTrust, setMinimumTrust] = useState<'established_media' | 'wire' | 'official'>('established_media');
  const news = data.news ?? EMPTY_NEWS;
  const stories = useMemo(() => clusterStories(news, { windowHours: hours, similarity }), [news, hours, similarity]);
  const entities = useMemo(() => correlateEntities(news), [news]);
  const alerts = useMemo(() => {
    const signals: ConvergenceSignal[] = news.flatMap(item => {
      if (!item.coords || item.location_precision !== 'reported' || !item.published || item.source_data_mode === 'stale') return [];
      const trust = trustFor(item.source);
      return [{ id: item.id, type: 'news', source: item.source, independenceKey: trust.independenceKey, trust, time: item.published, lat: item.coords[0], lng: item.coords[1], title: item.title, url: item.link }];
    });
    for (const quake of data.earthquakes ?? []) {
      if (!Number.isFinite(quake.time)) continue;
      const trust = trustFor('USGS');
      signals.push({ id: quake.id, type: 'seismic', source: 'USGS', independenceKey: trust.independenceKey, trust, time: new Date(quake.time).toISOString(), lat: quake.lat, lng: quake.lng, title: `M${quake.magnitude} ${quake.place}`, url: quake.url });
    }
    return detectConvergence(signals, { minimumTrust });
  }, [news, data.earthquakes, minimumTrust]);
  return <section className={styles.scroll} aria-label="Story analysis">
    <div className={styles.toolbar}>
      <label>Story window <select value={hours} onChange={event => setHours(Number(event.target.value))}><option value={12}>12 hours</option><option value={36}>36 hours</option><option value={72}>72 hours</option></select></label>
      <label>Title similarity <select value={similarity} onChange={event => setSimilarity(Number(event.target.value))}><option value={0.65}>65%</option><option value={0.8}>80%</option><option value={1}>Exact tokens</option></select></label>
      <label>Convergence minimum trust <select value={minimumTrust} onChange={event => setMinimumTrust(event.target.value as typeof minimumTrust)}><option value="established_media">Established media</option><option value="wire">Wire</option><option value="official">Official</option></select></label>
    </div>
    <p className={styles.count}>Deterministic URL/title grouping; publisher count is not independent corroboration. First seen is an observation by this server process and resets on restart. Entity dictionary coverage is limited; public-role names require an explicit reviewed dictionary.</p>
    <details><summary>Linked entities · {entities.length}</summary><ul>{entities.map(record => <li key={record.entity.id}><strong>{record.entity.label}</strong> · {record.entity.type} · {record.articleIds.length} reports · {record.publishers.join(', ')}</li>)}</ul></details>
    <details><summary>Geographic convergence · {alerts.length}</summary>
      <p>50 km radius, last 6 hours, at least 3 independent source types and score ≥40. Unique type weights: seismic 20, fire 15, aviation 15, maritime 15, news 10, outages 20, GNSS 15; cap 100. One source operator contributes one type. Approximate coordinates are excluded. Only reported news and seismic adapters are connected here so far.</p>
      {!alerts.length && <p>No qualifying convergence in the available signals. This does not imply safety or complete coverage.</p>}
      {alerts.map(alert => <article key={alert.id}><strong>Indicative score {alert.score}/100</strong><p>{alert.label}</p><button type="button" onClick={() => onLocate(alert.anchor.lat, alert.anchor.lng)}>Locate area</button><ul>{alert.contributions.map(signal => <li key={`${signal.source}:${signal.id}`}><a href={safeSourceUrl(signal.url)} target="_blank" rel="noreferrer">{signal.title}</a> · {signal.source} · {signal.type} · {signal.time} · {signal.trust.tier}</li>)}</ul></article>)}
    </details>
    {!stories.length && <p className={styles.empty}>No source reports available for grouping.</p>}
    <ol className={styles.list}>{stories.slice(0, 200).map(story => {
      const context = whyItMatters(story.articles[0]);
      return <li key={story.id} className={styles.event} style={{ display: 'block' }}>
        <h3>{story.title}</h3><p>{story.publisherCount} publishers · {story.articles.length} reports</p>
        <p>First seen by this process: {story.firstSeen ?? 'Not recorded'} · Earliest publication: {story.earliestPublication ?? 'Unknown'}</p>
        <p>{context.label}: {context.text}</p>
        <details><summary>Evidence and trust</summary><ul>{story.articles.map(item => {
          const trust = trustFor(item.source);
          return <li key={item.id}><a href={safeSourceUrl(item.link)} target="_blank" rel="noreferrer">{item.title}</a><p>{item.source} · {trust.tier} · {trust.configuredBy === 'unreviewed' ? 'Trust not reviewed' : 'Manually configured trust'}{trust.stateAffiliated ? ' · State affiliated' : ''}{trust.propagandaRisk ? ' · Propaganda-risk flag' : ''}</p><p>{item.source_data_mode === 'stale' ? `Stale since ${item.source_stale_since ?? 'unknown'}` : item.source_data_mode ?? 'Fetch freshness not recorded'} · last fetch success {item.source_last_success ?? 'not recorded'}</p><time>{item.published ?? 'Publication date unknown'}</time></li>;
        })}</ul></details>
      </li>;
    })}</ol>
  </section>;
}
