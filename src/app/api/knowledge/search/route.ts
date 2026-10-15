import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { parseFilters, searchKnowledge } from '@/lib/knowledge/search';
import { knowledgeError, readKnowledgeBody } from '@/lib/knowledge/http';
import { KnowledgeInputError } from '@/lib/knowledge/errors';
import { isRateLimited } from '@/lib/ssrf-guard';
export async function POST(request: NextRequest) {
  try {
    const actor=await requireAuthenticatedActor(request,'import:read');
    if(isRateLimited(`knowledge:search:${actor.userId}`,30,60_000))return NextResponse.json({error:'Search limit reached. Try again shortly.'},{status:429,headers:{'Retry-After':'60'}});
    const body=await readKnowledgeBody(request);
    if (typeof body.question!=='string' || !body.question.trim() || body.question.length>2000) throw new KnowledgeInputError('Enter a question of 1–2,000 characters.');
    return NextResponse.json(await searchKnowledge(actor,body.question,parseFilters(body.filters),{useEmbeddings:false}));
  } catch(error) { return knowledgeError(error); }
}
