import type { OrganizationActor } from '@/lib/operations/types';
import { knowledgeTransaction } from './database';
export interface EmbeddingSettings {baseUrl:string;model:string;apiKey?:string}
export async function getEmbeddingSettings(organizationId:string|null,actor?:OrganizationActor):Promise<EmbeddingSettings> {
  const defaults={baseUrl:process.env.EMBEDDING_BASE_URL ?? '',model:process.env.EMBEDDING_MODEL ?? '',apiKey:process.env.EMBEDDING_API_KEY};
  if(!organizationId)return defaults;
  const row=await knowledgeTransaction(actor ?? null,async(c)=>(await c.query('select embedding_base_url,embedding_model from ophanim_knowledge_settings where organization_id=$1',[organizationId])).rows[0]);
  if(!row)return defaults;
  return {baseUrl:row.embedding_base_url,model:row.embedding_model,apiKey:row.embedding_base_url===defaults.baseUrl ? defaults.apiKey:undefined};
}
