import { DOCUMENT_FIELDS,TASK_SCHEMAS } from './task-schemas';
import type { AiTask } from './providers/types';

export function validateTaskOutput(task:AiTask,output:string):void {
  const descriptor=TASK_SCHEMAS[task];
  if (!descriptor) return;
  const value=JSON.parse(output) as Record<string,unknown>;
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('AI output must be a JSON object.');
  const fields=Object.keys(descriptor);
  if (Object.keys(value).some(k=>!fields.includes(k)) || fields.some(k=>!(k in value))) throw new Error('AI output does not match the fixed task schema.');
  if (task in DOCUMENT_FIELDS) {
    for(const [key,v] of Object.entries(value)) {
      const numeric=['pieces','gross_weight_kg','net_weight_kg','total_amount'].includes(key);
      if(v!==null && (typeof v!==(numeric ? 'number':'string') || (numeric && (!Number.isFinite(v as number) || (v as number)<0)))) throw new Error('Invalid extraction field type.');
    }
  }
  if (task==='forecast' && value.label!=='FORECAST') throw new Error('Forecast must be labelled FORECAST.');
  if (task==='flag_incident' && typeof value.is_incident!=='boolean') throw new Error('Invalid incident classification.');
  if ('confidence' in value && (typeof value.confidence!=='number' || value.confidence<0 || value.confidence>1)) throw new Error('Invalid confidence.');
  for(const [key,sample] of Object.entries(descriptor))if(Array.isArray(sample) && !Array.isArray(value[key]))throw new Error(`Invalid array field: ${key}`);
  const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
  const string=(v:unknown)=>typeof v==='string';
  const nullableString=(v:unknown)=>v===null||string(v);
  const stringArray=(v:unknown)=>Array.isArray(v)&&v.every(string);
  const fixedObject=(v:unknown,keys:string[])=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>k in v);
  const requireValid=(condition:boolean)=>{if(!condition)throw new Error('AI output has invalid nested fields.');};
  for(const key of ['references','deadlines','requested_actions','entities','places','dates','topics','unknown','evidence','would_change_outlook'])if(key in value)requireValid(stringArray(value[key]));
  for(const key of ['summary','explanation','claim_type','question','time_horizon','uncertainty'])if(key in value)requireValid(string(value[key]));
  for(const key of ['place','time','type'])if(key in value)requireValid(nullableString(value[key]));
  if(task==='classify_document')requireValid(string(value.document_type));
  if(task==='parse_claim')requireValid(fixedObject(value.time_window,['start','end'])&&nullableString((value.time_window as Record<string,unknown>).start)&&nullableString((value.time_window as Record<string,unknown>).end));
  if(task==='flag_incident')requireValid(['low','moderate','high','unknown'].includes(value.severity as string));
  if(task==='understand_email')requireValid((value.milestones as unknown[]).every(v=>fixedObject(v,['type','date'])&&string((v as Record<string,unknown>).type)&&nullableString((v as Record<string,unknown>).date)));
  if(task==='parse_watch')requireValid((value.routes as unknown[]).every(v=>fixedObject(v,['origin','destination'])&&string((v as Record<string,unknown>).origin)&&string((v as Record<string,unknown>).destination)));
  if(task==='forecast')requireValid((value.outcomes as unknown[]).every(v=>fixedObject(v,['outcome','uncertainty'])&&string((v as Record<string,unknown>).outcome)&&string((v as Record<string,unknown>).uncertainty)));
  if(task==='summarise_event'){
    for(const key of ['confirmed','reported'])requireValid((value[key] as unknown[]).every(v=>fixedObject(v,['text','citations'])&&string((v as Record<string,unknown>).text)&&stringArray((v as Record<string,unknown>).citations)));
    requireValid((value.timeline as unknown[]).every(v=>fixedObject(v,['time','event','citations'])&&string((v as Record<string,unknown>).time)&&string((v as Record<string,unknown>).event)&&stringArray((v as Record<string,unknown>).citations)));
  }
}
