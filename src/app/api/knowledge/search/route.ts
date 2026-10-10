import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { parseFilters, searchKnowledge } from '@/lib/knowledge/search';
import { knowledgeError } from '@/lib/knowledge/http';
export async function POST(request: NextRequest) {
  try {
    const actor=await requireAuthenticatedActor(request,'import:read'); const body=await request.json();
    if (typeof body.question!=='string' || !body.question.trim() || body.question.length>2000) throw new Error('Enter a question of 1–2,000 characters.');
    return NextResponse.json(await searchKnowledge(actor,body.question,parseFilters(body.filters)));
  } catch(error) { return knowledgeError(error); }
}
