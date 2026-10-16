import { KnowledgeInputError } from '@/lib/knowledge/errors';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { addDocument, listDocuments } from '@/lib/knowledge/documents';
import { cronAuthorized, documentPage, knowledgeError } from '@/lib/knowledge/http';
import { limitedFormData } from '@/lib/http/limited-form-data';
import { validateSharedMetadata } from '@/lib/knowledge/safety';

// Shared administration is deployment-level. Tenant owners cannot publish their
// private data into a global index; the deployment secret is required for writes.
export async function GET(request: NextRequest) {
  try { await requireAuthenticatedActor(request,'organization:manage'); return NextResponse.json(await listDocuments(null,documentPage(request))); }
  catch(error) { return knowledgeError(error); }
}
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({error:'Deployment administrator credentials required.'},{status:401});
  try {
    const form=await limitedFormData(request,11*1024*1024); const file=form.get('file');
    if (!(file instanceof File)) throw new KnowledgeInputError('A shared file is required.');
    return NextResponse.json(await addDocument(null,file,validateSharedMetadata(JSON.parse(String(form.get('metadata'))))),{status:202});
  } catch(error) { return knowledgeError(error); }
}
