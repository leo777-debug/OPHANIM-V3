'use client';
import CalibrationChart,{type CalibrationBin} from './CalibrationChart';
import DemurrageMeter from './DemurrageMeter';
import { useCallback,useEffect,useState } from 'react';
type Forecast={threshold?:{at?:string};id:string;question_id:string;source_type:string;probability:number|null;p10_at:string|null;p50_at:string|null;p90_at:string|null;base_rate:number|null;question_text:string;issued_at:string;brier:number|null;drivers:Array<{feature:string;contribution:number;method:string;evidence_ids:string[]}>;analogs:Array<{shipment_id:string;on_time:boolean;delay_hours:number}>;rules_fired:Array<{name:string;n:number;delay_probability:number}>;trigger:{pre_mortem?:string;dissent?:{analyst:string;probability:number};what_would_change_this?:string[];action?:{description:string;basis:string};missing_features?:string[]}};
const percent=(p:number|null)=>p===null?'unavailable':`${Math.round(p*100)}%`;
export default function ForecastCard({shipmentId,onEvidence}:{shipmentId:string;onEvidence?:(id:string)=>void}){
 const [forecasts,setForecasts]=useState<Forecast[]>([]),[record,setRecord]=useState<Array<{n:number;mean_brier:number|null;calibration_bins:CalibrationBin[]}>>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[probability,setProbability]=useState('50'),[reason,setReason]=useState(''),[questions,setQuestions]=useState<Array<{id:string;question_text:string}>>([]);
 const load=useCallback(async()=>{const r=await fetch(`/api/forecasts?shipment=${encodeURIComponent(shipmentId)}`,{cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.error??'Forecast ledger unavailable.');setForecasts(b.forecasts);setRecord(b.trackRecord);setQuestions(b.questions??[]);},[shipmentId]);
 useEffect(()=>{const controller=new AbortController();void fetch(`/api/forecasts?shipment=${encodeURIComponent(shipmentId)}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error??'Forecast ledger unavailable.');setForecasts(b.forecasts);setRecord(b.trackRecord);setQuestions(b.questions??[]);}).catch(e=>{if(!controller.signal.aborted)setNotice(e.message);});return()=>controller.abort();},[shipmentId]);
 async function issue(){setBusy(true);try{const r=await fetch('/api/forecasts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shipmentId})});const b=await r.json();if(!r.ok)throw new Error(b.error);setNotice(b.reason??`Forecast ${b.status}.`);await load();}catch(e){setNotice(e instanceof Error?e.message:'Forecast unavailable.');}finally{setBusy(false);}}
 const forecast=forecasts.find(f=>f.source_type==='ensemble');
 async function human(){const questionId=forecast?.question_id??questions[0]?.id;if(!questionId)return;try{const r=await fetch('/api/forecasts/human',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questionId,probability:Number(probability)/100,reasoning:reason})});if(!r.ok)throw new Error((await r.json()).error);setNotice('Your probability is stamped and will be scored on the same ledger.');await load();}catch(e){setNotice(e instanceof Error?e.message:'Could not record call.');}}
 return <section className="lens-forecast" aria-label="The Panel forecast card"><h2>The Panel</h2><p>Evidence first. Probabilities require history and a validated model.</p>
  <button disabled={busy} onClick={()=>void issue()}>{busy?'Checking history…':'Forecast this route'}</button>{notice&&<p role="status">{notice}</p>}
  {!forecast?<p>No validated forecast recorded. Missing history is uncertainty.</p>:<>
   <h3>{forecast.question_text}</h3><strong className="lens-probability">{percent(forecast.probability)}</strong><p>Base rate {percent(forecast.base_rate)} → panel {percent(forecast.probability)}. Confidence: limited; see missing features and track record.</p>
   <dl>{(['p10_at','p50_at','p90_at'] as const).map(k=><div key={k}><dt>{k.slice(0,3).toUpperCase()} ETA</dt><dd>{forecast[k]?new Date(forecast[k]!).toLocaleString():'unavailable'}</dd></div>)}</dl>
   <p>80% split-conformal interval; coverage can fail under a regime shift.</p>
   <DemurrageMeter analogs={forecast.analogs} plannedAt={forecast.threshold?.at}/>
   <h4>Main drivers</h4>{forecast.drivers.map(d=><div key={d.feature}><p>{d.feature.replaceAll('_',' ')}: {d.contribution.toFixed(3)} ({d.method})</p>{d.evidence_ids.slice(0,3).map(id=><button key={id} onClick={()=>onEvidence?.(id)}>Evidence {id.slice(0,8)}</button>)}</div>)}
   <details><summary>Closest historical analogs ({forecast.analogs.length})</summary><p>{forecast.analogs.filter(a=>a.on_time).length} arrived on time.</p>{forecast.analogs.map(a=><p key={a.shipment_id}>{a.on_time?'On time':'Late'} · {Math.round(a.delay_hours)} h vs promise</p>)}</details>
   <details><summary>Precursor rules</summary>{forecast.rules_fired.length?forecast.rules_fired.map(r=><p key={r.name}>{r.name}: {percent(r.delay_probability)}, n={r.n}</p>):<p>No supported rule fired.</p>}</details>
   <p>Pre-mortem: {forecast.trigger.pre_mortem}</p><p>Strongest dissent: {forecast.trigger.dissent?`${forecast.trigger.dissent.analyst} — ${percent(forecast.trigger.dissent.probability)}`:'none recorded'}</p>
   <p>What would change this: {forecast.trigger.what_would_change_this?.join('; ')}</p><p>{forecast.trigger.action?.description} {forecast.trigger.action?.basis}</p>
   <details><summary>Missing inputs</summary><p>{forecast.trigger.missing_features?.join(', ')||'See snapshot'}</p></details>

  </>}
  {(forecast||questions.length>0)&&<>   <h4>Operator call</h4><label>Your probability (%)<input type="number" min="0" max="100" value={probability} onChange={e=>setProbability(e.target.value)}/></label><label>Reasoning / correction<textarea value={reason} maxLength={4000} onChange={e=>setReason(e.target.value)}/></label><button disabled={reason.trim().length<10} onClick={()=>void human()}>Stamp my call</button></>}
  <h4>Receipts on similar routes</h4><a href="/receipts">Public Receipts ledger</a>{record.length?record.map((r,i)=><p key={i}>n={r.n} · mean Brier {r.mean_brier?.toFixed(3)??'unresolved'}</p>):<p>No scored track record yet. No accuracy claim.</p>}
  <CalibrationChart bins={record[0]?.calibration_bins??[]}/>
  <details><summary>Forecast history ({forecasts.length})</summary>{forecasts.map(f=><p key={f.id}>{new Date(f.issued_at).toLocaleString()} · {f.source_type} · {percent(f.probability)} · Brier {f.brier?.toFixed(3)??'unresolved'}</p>)}</details>
 </section>;
}
