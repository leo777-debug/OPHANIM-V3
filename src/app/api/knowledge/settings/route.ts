import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { getEmbeddingSettings } from '@/lib/knowledge/settings';
import { knowledgeTransaction } from '@/lib/knowledge/database';
import { assertSameOrigin,knowledgeError } from '@/lib/knowledge/http';
import { validateAiBaseUrl } from '@/lib/ai/providers/openai-compatible-provider';
import { embedTexts } from '@/lib/knowledge/embeddings';
export async function GET(request:NextRequest){try{const actor=await requireAuthenticatedActor(request,'import:read');const settings=await getEmbeddingSettings(actor.organizationId,actor);return NextResponse.json({baseUrl:settings.baseUrl,model:settings.model,dimensions:1024});}catch(e){return knowledgeError(e);}}
export async function PUT(request:NextRequest){try{
  assertSameOrigin(request);const actor=await requireAuthenticatedActor(request,'organization:manage');const body=await request.json();
  if(typeof body.baseUrl!=='string' || typeof body.model!=='string' || !body.model.trim() || body.model.length>200)throw new Error('Embedding URL and model are required.');
  await validateAiBaseUrl(body.baseUrl);await embedTexts(['Embedding connection test.'],{baseUrl:body.baseUrl,model:body.model});
  await knowledgeTransaction(actor,async(c)=>{
    const models=await c.query('select distinct model from ophanim_knowledge_embeddings where organization_id=$1',[actor.organizationId]);
    if(models.rows.some(r=>r.model!==body.model))throw new Error('Delete/reindex existing documents before changing embedding model; vector spaces cannot be mixed.');
    await c.query('insert into ophanim_knowledge_settings(organization_id,embedding_base_url,embedding_model) values($1,$2,$3) on conflict(organization_id) do update set embedding_base_url=$2,embedding_model=$3,updated_at=now()',[actor.organizationId,body.baseUrl,body.model]);
  });return NextResponse.json({saved:true,dimensions:1024});
}catch(e){return knowledgeError(e);}}
