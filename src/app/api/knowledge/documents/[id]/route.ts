import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { knowledgeTransaction } from '@/lib/knowledge/database';
import { queueDeletion } from '@/lib/knowledge/documents';
import { assertSameOrigin, knowledgeError } from '@/lib/knowledge/http';
import { readPrivateFile } from '@/lib/knowledge/storage';

export async function GET(request: NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireAuthenticatedActor(request,'import:read'); const {id}=await params;
    const document=await knowledgeTransaction(actor,async(c)=>(await c.query('select * from ophanim_knowledge_documents where id=$1 and status<>\'deleting\'',[id])).rows[0]);
    if (!document) return NextResponse.json({error:'Document not found.'},{status:404});
    if (request.nextUrl.searchParams.get('download')==='1') {
      const bytes=await readPrivateFile(document.storage_path);
      return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    const chunks=await knowledgeTransaction(actor,(c)=>c.query('select id,content,reference from ophanim_knowledge_chunks where document_id=$1 order by ordinal limit 2000',[id]));
    return NextResponse.json({document:{id:document.id,fileName:document.file_name},chunks:chunks.rows},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { return knowledgeError(error); }
}
export async function DELETE(request: NextRequest,{params}:{params:Promise<{id:string}>}) {
  try { assertSameOrigin(request); const actor=await requireAuthenticatedActor(request,'import:write'); return NextResponse.json(await queueDeletion(actor,(await params).id),{status:202}); }
  catch(error) { return knowledgeError(error); }
}
