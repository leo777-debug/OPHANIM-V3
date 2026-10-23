import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { addDocument, listDocuments } from '@/lib/knowledge/documents';
import { cronAuthorized, knowledgeError } from '@/lib/knowledge/http';
import { validateSharedMetadata } from '@/lib/knowledge/safety';
import { isSchemaPendingError, SCHEMA_PENDING_MESSAGE } from '@/lib/db/schema-pending';

// Shared administration is deployment-level. Tenant owners cannot publish their
// private data into a global index; the deployment secret is required for writes.
export async function GET(request: NextRequest) {
  try { await requireAuthenticatedActor(request,'organization:manage'); return NextResponse.json(await listDocuments(null)); }
  catch(error) { return isSchemaPendingError(error) ? NextResponse.json({ documents: [], storageBytes: 0, setupPending: true, notice: SCHEMA_PENDING_MESSAGE }) : knowledgeError(error); }
}
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({error:'Deployment administrator credentials required.'},{status:401});
  try {
    const form=await request.formData(); const file=form.get('file');
    if (!(file instanceof File)) throw new Error('A shared file is required.');
    return NextResponse.json(await addDocument(null,file,validateSharedMetadata(JSON.parse(String(form.get('metadata'))))),{status:202});
  } catch(error) { return knowledgeError(error); }
}
