import { db } from '@/lib/watchlists/db';
import { queueIntelligenceAlertDeliveries } from '@/lib/intelligence/notifications';
export async function queueForecastAlerts(){
 const candidates=await db().query(`select f.id,f.organization_id,f.question_id,f.probability,s.shipment_reference,q.question_text
  from ophanim_forecasts f join ophanim_forecast_questions q on q.id=f.question_id and q.organization_id=f.organization_id
  join ophanim_shipments s on s.id=f.shipment_id and s.organization_id=f.organization_id
  where f.source_type='ensemble' and f.probability<0.6 and q.status='open' and f.issued_at>now()-interval '1 day'
  and f.id=(select id from ophanim_forecasts where question_id=f.question_id and organization_id=f.organization_id and source_type='ensemble' order by issued_at desc limit 1)
  and not exists(select 1 from ophanim_intelligence_alerts a join ophanim_forecasts prev on prev.id=a.forecast_id
   where a.organization_id=f.organization_id and prev.question_id=f.question_id and a.created_at>now()-interval '1 day') limit 100`);
 let queued=0;
 for(const f of candidates.rows){
  const summary=`Local validated panel: ${Math.round(f.probability*100)}% for “${f.question_text}”. Limited confidence; review route evidence and uncertainty before acting.`;
  const alert=await db().query(`insert into ophanim_intelligence_alerts(organization_id,forecast_id,alert_category,title,summary) values($1,$2,'logistics','Shipment forecast needs review',$3) on conflict(forecast_id) do nothing returning id`,[f.organization_id,f.id,summary]);
  if(!alert.rowCount)continue;
  queued+=await queueIntelligenceAlertDeliveries({id:alert.rows[0].id,organizationId:f.organization_id,assessmentId:undefined,category:'logistics',title:'Shipment forecast needs review',summary,confidenceScore:55,subjectLabel:f.shipment_reference,sourceName:'The Panel · local validated model'});
 }
 return {queued};
}
