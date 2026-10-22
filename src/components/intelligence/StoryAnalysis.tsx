'use client';

import { useEffect, useMemo, useState } from 'react';
import { GAZETTEER, clusterStories, correlateEntities, detectConvergence, trustFor, whyItMatters, type ConvergenceSignal, type GazetteerEntry } from '@/lib/intelligence/analysis';
import { safeSourceUrl, type NewsItem } from '@/lib/intelligence/news';
import type { ExplorerData } from './IntelligenceExplorer';
import { COUNTRY_REFERENCE } from '@/lib/intelligence/country-gazetteer';
import styles from './desk.module.css';
import CrossFeedEntities from './CrossFeedEntities';
import {newsEvidence,quakeEvidence,fireEvidence} from '@/lib/intelligence/evidence-graph';

const EMPTY_NEWS: NewsItem[] = [];
export default function StoryAnalysis({ data, onLocate, replay = false }: { data: ExplorerData; onLocate: (lat: number, lng: number) => void; replay?: boolean }) {
  const [hours, setHours] = useState(36);
  const [similarity, setSimilarity] = useState(0.65);
  const [minimumTrust, setMinimumTrust] = useState<'established_media' | 'wire' | 'official'>('established_media');
  const [portDictionary, setPortDictionary] = useState<readonly GazetteerEntry[] | null>(null);
  const [portReference, setPortReference] = useState<typeof import('@/lib/intelligence/port-gazetteer')['PORT_REFERENCE'] | null>(null);
  const [portLoadFailed, setPortLoadFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void import('@/lib/intelligence/port-gazetteer').then(module => {
      if (!cancelled) { setPortDictionary(module.mergedPortGazetteer()); setPortReference(module.PORT_REFERENCE); }
    }).catch(() => { if (!cancelled) setPortLoadFailed(true); });
    return () => { cancelled = true; };
  }, []);
  const dictionary = portDictionary ?? GAZETTEER;
  const news = data.news ?? EMPTY_NEWS;
  const stories = useMemo(() => clusterStories(news, { windowHours: hours, similarity, dictionary }), [news, hours, similarity, dictionary]);
  const entities = useMemo(() => correlateEntities(news, dictionary), [news, dictionary]);
  const evidenceRecords = useMemo(() => [...newsEvidence(news),...quakeEvidence(data.earthquakes??[]),...fireEvidence(data.fires??[])],[news,data.earthquakes,data.fires]);
  const alerts = useMemo(() => {
    if (replay) return [];
    const signals: ConvergenceSignal[] = news.flatMap(item => {
      if (!item.coords || item.location_precision !== 'reported' || !item.published || item.source_data_mode !== 'fresh') return [];
      const trust = trustFor(item.source);
      return [{ id: item.id, type: 'news', source: item.source, independenceKey: trust.independenceKey, trust, time: item.published, lat: item.coords[0], lng: item.coords[1], title: item.title, url: item.link }];
    });
    for (const quake of data.earthquakes ?? []) {
      if (!Number.isFinite(quake.time)) continue;
      const trust = trustFor('USGS');
      signals.push({ id: quake.id, type: 'seismic', source: 'USGS', independenceKey: trust.independenceKey, trust, time: new Date(quake.time).toISOString(), lat: quake.lat, lng: quake.lng, title: `M${quake.magnitude} ${quake.place}`, url: quake.url });
    }
    for (const fire of data.fires ?? []) {
      if (fire.type === 'volcano') continue;
      const clock = fire.time?.padStart(4, '0');
      const observed = fire.observedAt || (fire.date && clock && /^\d{4}-\d{2}-\d{2}$/.test(fire.date) && /^\d{4}$/.test(clock) ? `${fire.date}T${clock.slice(0, 2)}:${clock.slice(2)}:00Z` : null);
      if (!observed || !Number.isFinite(Date.parse(observed))) continue;
      const trust = trustFor('NASA');
      signals.push({ id: `firms:${fire.lat}:${fire.lng}:${observed}`, type: 'fire', source: 'NASA FIRMS', independenceKey: trust.independenceKey, trust, time: observed, lat: fire.lat, lng: fire.lng, title: fire.title || 'Satellite-observed fire hotspot', url: 'https://firms.modaps.eosdis.nasa.gov/' });
    }
    return detectConvergence(signals, { minimumTrust });
  }, [news, data.earthquakes, data.fires, minimumTrust, replay]);
  return <section className={styles.scroll} aria-label="Story analysis">
    <div className={styles.toolbar}>
      <label>Story window <select value={hours} onChange={event => setHours(Number(event.target.value))}><option value={12}>12 hours</option><option value={36}>36 hours</option><option value={72}>72 hours</option></select></label>
      <label>Title similarity <select value={similarity} onChange={event => setSimilarity(Number(event.target.value))}><option value={0.65}>65%</option><option value={0.8}>80%</option><option value={1}>Exact tokens</option></select></label>
      <label>Convergence minimum trust <select value={minimumTrust} onChange={event => setMinimumTrust(event.target.value as typeof minimumTrust)}><option value="established_media">Established media</option><option value="wire">Wire</option><option value="official">Official</option></select></label>
    </div>
    <p className={styles.count}>Deterministic URL/title grouping; publisher count is not independent corroboration. First seen is Ophanim’s earliest recorded observation, separate from publication time. Storage is shown with each story; memory fallback resets on restart. Country/territory names use 249 scoped English/Arabic labels; Port reference aliases load separately; other city/asset dictionary coverage is limited. Name matches do not locate an event or establish impact. Public-role names require an explicit reviewed dictionary.</p>
    <details><summary>Geographic dictionary source and date</summary><p>{COUNTRY_REFERENCE.name} · {COUNTRY_REFERENCE.version} · generated {COUNTRY_REFERENCE.datasetDate} ({COUNTRY_REFERENCE.dateMeaning}). {COUNTRY_REFERENCE.coverage}</p><p>{COUNTRY_REFERENCE.attribution} · commercial use {COUNTRY_REFERENCE.commercialUse} · {COUNTRY_REFERENCE.rateLimits}.</p><a href={COUNTRY_REFERENCE.source} target="_blank" rel="noreferrer">Original source</a>{' · '}<a href="/reference/UNICODE-LICENSE.txt">Unicode licence</a></details>
    <details><summary>Port-mention dictionary</summary>
      {!portReference ? <p>{portLoadFailed ? 'Port reference unavailable; curated country/asset matching remains available.' : 'Loading the packaged port reference for explicit name/code matching.'}</p> : <>
        <p>{portReference.entryCount} reference identities from {portReference.sourceRecordCount} source records · {portReference.withheldAliases} ambiguous alias occurrences withheld. Existing curated port identities are preserved.</p>
        <p>{portReference.method} The dictionary does not supply event coordinates or current port status. Bare city names do not acquire port identities.</p>
        <p>{portReference.attribution} · {portReference.licence} · source dataset {portReference.sourceDatasetDate} ({portReference.dateMeaning}).</p>
        <a href={portReference.source} target="_blank" rel="noreferrer">Pinned original port reference</a>{' · '}<a href={portReference.termsUrl} target="_blank" rel="noreferrer">Licence terms</a>
      </>}
    </details>
    <details><summary>Linked entities · {entities.length}</summary><ul>{entities.map(record => <li key={record.entity.id}><strong>{record.entity.label}</strong> · {record.entity.type} · {record.articleIds.length} reports · {record.publishers.join(', ')}</li>)}</ul></details>
    <CrossFeedEntities records={evidenceRecords} dictionary={dictionary} replay={replay} />
    <details><summary>Geographic convergence · {alerts.length}</summary>
      <p>50 km radius, last 6 hours, at least 3 independent source types and score ≥40. Unique type weights: seismic 20, fire 15, aviation 15, maritime 15, news 10, outages 20, GNSS 15; cap 100. One source operator contributes one type. Approximate coordinates are excluded. Reported news, seismic observations and dated NASA fire hotspots are connected. Aviation, maritime, outage and GNSS disruption adapters remain pending.</p>
      {replay ? <p>Replay is active. Current convergence detection is disabled; recorded stories and their original source times remain available.</p> : !alerts.length && <p>No qualifying convergence in the available signals. This does not imply safety or complete coverage.</p>}
      {alerts.map(alert => <article key={alert.id}><strong>Indicative score {alert.score}/100</strong><p>{alert.label}</p><button type="button" onClick={() => onLocate(alert.anchor.lat, alert.anchor.lng)}>Locate area</button><ul>{alert.contributions.map(signal => <li key={`${signal.source}:${signal.id}`}><a href={safeSourceUrl(signal.url)} target="_blank" rel="noreferrer">{signal.title}</a> · {signal.source} · {signal.type} · {signal.time} · {signal.trust.tier}</li>)}</ul></article>)}
    </details>
    {!stories.length && <p className={styles.empty}>No source reports available for grouping.</p>}
    <ol className={styles.list}>{stories.slice(0, 200).map(story => {
      const context = whyItMatters(story.articles[0], dictionary);
      return <li key={story.id} className={styles.event} style={{ display: 'block' }}>
        <h3>{story.title}</h3><p>{story.publisherCount} publishers · {story.articles.length} reports</p>
        <p>First observed by Ophanim: {story.firstSeen ?? 'Not recorded'} · Earliest publication: {story.earliestPublication ?? 'Unknown'}</p>
        <p>Observation storage: {[...new Set(story.articles.map(item => item.first_seen_storage ?? 'not recorded'))].join(', ')}{story.articles.some(item => item.first_seen_warning) ? ' · Persistence unavailable for some observations; times may reset.' : ''}</p>
        <p>{context.label}: {context.text}</p>
        <details><summary>Evidence and trust</summary><ul>{story.articles.map(item => {
          const trust = trustFor(item.source);
          return <li key={item.id}><a href={safeSourceUrl(item.link)} target="_blank" rel="noreferrer">{item.title}</a><p>{item.source} · {trust.tier} · {trust.configuredBy === 'unreviewed' ? 'Trust not reviewed' : 'Manually configured trust'}{trust.stateAffiliated ? ' · State affiliated' : ''}{trust.propagandaRisk ? ' · Propaganda-risk flag' : ''}</p><p>{item.source_data_mode === 'stale' ? `Stale since ${item.source_stale_since ?? 'unknown'}` : item.source_data_mode ?? 'Fetch freshness not recorded'} · last fetch success {item.source_last_success ?? 'not recorded'}</p><time>{item.published ?? 'Publication date unknown'}</time></li>;
        })}</ul></details>
      </li>;
    })}</ol>
  </section>;
}
