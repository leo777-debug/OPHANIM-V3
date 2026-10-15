import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { getServerAiConfig,parseAiConfig } from '@/lib/ai/config';
import { generateWithRouting } from '@/lib/ai/local-model';
import { knowledgeError,readKnowledgeBody } from '@/lib/knowledge/http';
import { KnowledgeInputError } from '@/lib/knowledge/errors';
import { authorizeAiRequest } from '@/lib/ai/access';
import { parseFilters,searchKnowledge } from '@/lib/knowledge/search';
import { neutraliseInstructions,NOT_FOUND,validateGroundedAnswer } from '@/lib/knowledge/safety';
import type { KnowledgeStatement } from '@/lib/knowledge/types';
export async function POST(request:NextRequest) {
  const denied=await authorizeAiRequest(request); if(denied)return denied;
  try {
    const actor=await requireAuthenticatedActor(request,'import:read'); const body=await readKnowledgeBody(request);
    if (typeof body.question!=='string' || !body.question.trim() || body.question.length>2000) throw new KnowledgeInputError('Enter a question of 1–2,000 characters.');
    const result=await searchKnowledge(actor,body.question,parseFilters(body.filters));
    let statements:KnowledgeStatement[]=[{label:'NOT FOUND',text:NOT_FOUND,citations:[]}]; let warning=result.warning;
    if (result.chunks.length) {
      try {
        const generated=await generateWithRouting(parseAiConfig(body.config) ?? getServerAiConfig(),{
          task:'grounded_qa',mode:body.mode==='general' ? 'general':'logistics',input:body.question,
          context:result.chunks.map(c=>({id:c.id,content:neutraliseInstructions(c.content),source:c.source_file,reference:c.reference,date:c.published_at})) });
        const validated=validateGroundedAnswer(generated.output,result.chunks);
        if (validated.length) statements=validated;
      } catch { warning='AI unavailable or answer failed grounding validation; sources remain available for review.'; }
    }
    return NextResponse.json({statements,searched:result.searched,warning,citations:result.chunks.map(c=>({id:c.id,fileName:c.source_file,reference:c.reference,date:c.published_at,url:`/knowledge/documents/${c.document_id}?chunk=${c.id}`}))});
  } catch(error) { return knowledgeError(error); }
}
