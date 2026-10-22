'use client';
import {useState} from 'react';
import {demurrageExposure} from '@/lib/forecast/demurrage';
export default function DemurrageMeter({analogs,plannedAt}:{analogs:Array<{delay_hours:number}>;plannedAt?:string}){
 const [lastFree,setLastFree]=useState(''),[tariff,setTariff]=useState('');
 const estimate=plannedAt&&lastFree&&tariff?demurrageExposure(analogs,plannedAt,lastFree+'Z',Number(tariff)):null;
 return <details><summary>Demurrage Meter</summary><p>Scenario using your tariff and the historical analog arrival distribution. Arrival is not gate-out; fees can differ.</p>
  <label>Last free day ends (UTC)<input type="datetime-local" value={lastFree} onChange={e=>setLastFree(e.target.value)}/></label><label>Daily tariff (AED)<input type="number" min="0" value={tariff} onChange={e=>setTariff(e.target.value)}/></label>
  {estimate?<p>Analog exposure {Math.round(estimate.probability*100)}%; expected AED {estimate.expectedAed.toFixed(0)}; P10/P50/P90 AED {estimate.p10}/{estimate.p50}/{estimate.p90}; n={estimate.n}. Confirm free time and gate-out with the carrier.</p>:<p>A verified tariff, last-free timestamp and at least ten resolved analogs are required.</p>}
 </details>;
}
