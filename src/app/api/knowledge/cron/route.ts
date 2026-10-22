import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized, knowledgeError } from '@/lib/knowledge/http';
import { runKnowledgeJobs } from '@/lib/knowledge/jobs';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({error:'Unauthorized'},{status:401});
  try { return NextResponse.json(await runKnowledgeJobs(1)); }
  catch(error) { return knowledgeError(error); }
}
