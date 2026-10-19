import { NextRequest,NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { resolveAiConfig } from '@/lib/ai/config';
import { generateWithRouting } from '@/lib/ai/local-model';
import { knowledgeError } from '@/lib/knowledge/http';
import { parseFilters,searchKnowledge } from '@/lib/knowledge/search';
import { neutraliseInstructions,NOT_FOUND,validateGroundedAnswer } from '@/lib/knowledge/safety';
import { getClientIp,isRateLimited } from '@/lib/ssrf-guard';
import type { KnowledgeStatement } from '@/lib/knowledge/types';
export async function POST(request:NextRequest) {
  if (isRateLimited(getClientIp(request),10,60_000)) return NextResponse.json({error:'Rate limit exceeded'},{status:429});
  try {
    const actor=await requireAuthenticatedActor(request,'import:read'); const body=await request.json();
    if (typeof body.question!=='string' || !body.question.trim() || body.question.length>2000) throw new Error('Enter a question of 1–2,000 characters.');
    const result=await searchKnowledge(actor,body.question,parseFilters(body.filters));
    let statements:KnowledgeStatement[]=[{label:'NOT FOUND',text:NOT_FOUND,citations:[]}]; let warning=result.warning;
    if (result.chunks.length) {
      try {
        const generated=await generateWithRouting(resolveAiConfig(body.config),{
          task:'grounded_qa',mode:body.mode==='general' ? 'general':'logistics',input:body.question,
          context:result.chunks.map(c=>({id:c.id,content:neutraliseInstructions(c.content),source:c.source_file,reference:c.reference,date:c.published_at})) });
        const validated=validateGroundedAnswer(generated.output,result.chunks);
        if (validated.length) statements=validated;
      } catch { warning='AI unavailable or answer failed grounding validation; sources remain available for review.'; }
    }
    return NextResponse.json({statements,searched:result.searched,warning,citations:result.chunks.map(c=>({id:c.id,fileName:c.source_file,reference:c.reference,date:c.published_at,url:`/knowledge/documents/${c.document_id}?chunk=${c.id}`}))});
  } catch(error) { return knowledgeError(error); }
}
