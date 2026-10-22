import {db} from '@/lib/watchlists/db';
export const dynamic='force-dynamic';
export default async function Receipts(){
 let rows:Array<{source_type:string;question_type:string;month:string;n:number;mean_brier:number|null;mean_log_loss:number|null}>=[];
 let unavailable=false;
 if(process.env.DATABASE_URL)try{rows=(await db().query('select * from ophanim_public_receipts order by month desc limit 120')).rows;}catch{unavailable=true;}
 return <main className="ops-page" style={{maxWidth:1000,margin:'40px auto',padding:24}}><h1>Checking our work</h1><p>Ophanim Receipts: resolved probability forecasts scored against actual outcomes. Lower Brier score and log loss are better.</p>
  <p>Only consenting, aggregated cohorts of at least five organizations and 100 forecasts appear here. No customer shipment details are published.</p>
  {unavailable?<p>Receipts are temporarily unavailable.</p>:!rows.length?<p>No eligible public track record yet. We make no accuracy claim.</p>:<table><thead><tr><th>Month</th><th>Source</th><th>Question</th><th>n</th><th>Brier</th><th>Log loss</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{String(r.month).slice(0,10)}</td><td>{r.source_type}</td><td>{r.question_type}</td><td>{r.n}</td><td>{r.mean_brier===null?'—':Number(r.mean_brier).toFixed(3)}</td><td>{r.mean_log_loss===null?'—':Number(r.mean_log_loss).toFixed(3)}</td></tr>)}</tbody></table>}
  <p>Coverage, calibration and case mix matter. Small cohorts and unresolved forecasts cannot establish reliability.</p><a href="/logistics/map?tool=route-lens">Open Route Lens</a>
 </main>;
}
