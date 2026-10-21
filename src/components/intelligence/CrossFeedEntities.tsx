'use client';
import {useMemo,useState} from 'react';
import {buildEvidenceGraph,type EvidenceRecord} from '@/lib/intelligence/evidence-graph';
import type {GazetteerEntry} from '@/lib/intelligence/analysis';
import styles from './desk.module.css';
export default function CrossFeedEntities({records,dictionary,replay=false}:{records:readonly EvidenceRecord[];dictionary:readonly GazetteerEntry[];replay?:boolean}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const graph=useMemo(()=>buildEvidenceGraph(records,{dictionary,replay}),[records,dictionary,replay]);
 const entities=graph.entities.filter(entity=>`${entity.label} ${entity.id}`.toLowerCase().includes(query.trim().toLowerCase()));
 const entity=graph.entities.find(item=>item.id===selected);
 const evidence=entity?graph.records.filter(record=>entity.recordKeys.includes(record.key)):[];
 return <details><summary>Cross-feed entity links · {graph.entities.length} entities / {graph.records.length} records</summary>
  <p>{graph.method} {replay?'Replay evidence; current alerting remains disabled.':'Only the evidence currently loaded into this workspace is included.'}</p>
  <p>Connected here: news, seismic observations and dated/undated fire observations. The same normalized-event adapter is available to scoped event workspaces; this display does not imply every provider is connected. Up to 1000 records and 30 mentions/record; {graph.truncated} records omitted by the bound.</p>
  <label>Find a linked entity <input value={query} onChange={event=>setQuery(event.target.value)} type="search" /></label>
  <ul>{entities.slice(0,30).map(item=><li key={item.id}><button type="button" onClick={()=>setSelected(item.id)}>{item.label}</button> · {item.recordKeys.length} evidence records · {item.kinds.join(', ')}{item.kinds.length>1?' · multiple feed types':''}</li>)}</ul>
  {entities.length>30&&<p>Showing 30 matching entities; narrow the search.</p>}
  {entity&&<section aria-label="Linked source evidence"><h3>{entity.label}</h3><ul>{evidence.map(record=><li key={record.key}>
   {record.url?<a href={record.url} target="_blank" rel="noreferrer">{record.title}</a>:record.title} · {record.source} / {record.kind} · {record.trust.tier} ({record.trust.configuredBy==='operator'?'manually reviewed trust':'unreviewed trust'}) · {record.mode} freshness
   <p>Original source time: {record.publishedAt??'Unknown'}{record.temporal==='future'?' · Future-dated; not current evidence':''}</p>
  </li>)}</ul></section>}
  <details><summary>Loaded-source coverage and unresolved dates</summary><p>Counts describe loaded records, not worldwide source/geographic coverage or the absence of incidents. Unknown freshness and publication dates stay unknown.</p>
   <div style={{overflowX:'auto'}}><table className={styles.table}><thead><tr><th>Source</th><th>Records</th><th>Dated</th><th>Undated</th><th>Future dates</th><th>Stale</th><th>Unknown freshness</th><th>Replay</th><th>No entity match</th></tr></thead><tbody>{graph.coverage.map(row=><tr key={row.provider}><th>{row.source}</th><td>{row.count}</td><td>{row.dated}</td><td>{row.unknownDates}</td><td>{row.futureDates}</td><td>{row.stale}</td><td>{row.unknownFreshness}</td><td>{row.replay}</td><td>{row.unmatched}</td></tr>)}</tbody></table></div>
  </details>
 </details>;
}
