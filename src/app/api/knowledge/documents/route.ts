import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { addDocument, listDocuments,type PrivateDocumentMetadata } from '@/lib/knowledge/documents';
import { assertSameOrigin, knowledgeError } from '@/lib/knowledge/http';
import { limitedFormData, RequestBodyLimitError } from '@/lib/http/limited-form-data';
import { isRateLimited } from '@/lib/ssrf-guard';

export const runtime='nodejs';
export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listDocuments(await requireAuthenticatedActor(request,'import:read'))); }
  catch(error) { return knowledgeError(error); }
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); const actor=await requireAuthenticatedActor(request,'import:write');
    if (isRateLimited(`knowledge:upload:${actor.userId}`, 5, 60000)) return NextResponse.json({ error: 'Upload limit reached. Wait a minute.' }, { status: 429 });
    const form=await limitedFormData(request, 101 * 1024 * 1024); const files=form.getAll('files');
    if (!files.length || files.length>10) throw new Error('Upload 1–10 files per batch.');
    const rawMetadata=form.get('metadata');const metadata:PrivateDocumentMetadata=rawMetadata ? JSON.parse(String(rawMetadata)):{};
    if(!metadata || typeof metadata!=='object' || Array.isArray(metadata))throw new Error('Invalid document metadata.');
    const results=[];
    for (const file of files) {
      if (!(file instanceof File)) continue;
      try { results.push({ file:file.name,...await addDocument(actor,file,metadata) }); }
      catch(error) { results.push({file:file.name,error:error instanceof Error ? error.message:'Upload failed.'}); }
    }
    return NextResponse.json({results},{status:202});
  } catch(error) { return error instanceof RequestBodyLimitError ? NextResponse.json({ error: error.message }, { status: 413 }) : knowledgeError(error); }
}
