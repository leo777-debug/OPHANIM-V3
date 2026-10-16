import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { localModelStatus } from '@/lib/ai/local-model';
import { knowledgeError } from '@/lib/knowledge/http';
import { embeddingConfig } from '@/lib/knowledge/embeddings';
export async function GET(request:NextRequest) {
  try { await requireAuthenticatedActor(request); return NextResponse.json({...await localModelStatus(),embedding:{baseUrl:embeddingConfig().baseUrl,model:embeddingConfig().model,dimensions:1024}}); }
  catch(error) { return knowledgeError(error); }
}
