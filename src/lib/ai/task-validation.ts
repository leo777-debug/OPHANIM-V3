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
}
