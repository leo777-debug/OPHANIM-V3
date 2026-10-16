import { KnowledgeInputError } from './errors';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { OrganizationActor } from '@/lib/operations/types';
import { knowledgeTransaction } from './database';
import { deletePrivateFile, storePrivateFile } from './storage';
import { hashContent, validateSharedMetadata } from './safety';
import type { SharedMetadata } from './types';

export const KNOWLEDGE_EXTENSIONS = ['.pdf','.docx','.xlsx','.csv','.txt','.md','.eml','.png','.jpg','.jpeg','.json','.jsonl'];
export interface PrivateDocumentMetadata {document_type?:string;language?:string;published_at?:string;valid_from?:string;valid_to?:string|null;shipment_id?:string}

export async function addDocument(actor: OrganizationActor | null, file: File, metadata?: SharedMetadata & PrivateDocumentMetadata | PrivateDocumentMetadata) {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new KnowledgeInputError('Each file must be between 1 byte and 10 MB.');
  const fileName = path.basename(file.name.replace(/\\/g,'/')).replace(/[\u0000-\u001f]/g,'').slice(0,255);
  if (!KNOWLEDGE_EXTENSIONS.includes(path.extname(fileName).toLowerCase())) throw new KnowledgeInputError('Unsupported file type. Export .msg to .eml.');
  if (!actor) validateSharedMetadata(metadata);
  if(actor && metadata){
    for(const date of [metadata.published_at,metadata.valid_from,metadata.valid_to])if(date && (typeof date!=='string' || !Number.isFinite(Date.parse(date))))throw new KnowledgeInputError('Invalid document date.');
    if(metadata.document_type && (typeof metadata.document_type!=='string' || metadata.document_type.length>80))throw new KnowledgeInputError('Invalid document type.');
    if(metadata.language && !['en','ar','mixed','und'].includes(metadata.language))throw new KnowledgeInputError('Invalid document language.');
  }
  const bytes = Buffer.from(await file.arrayBuffer()); const hash = hashContent(bytes);
  const existing = await knowledgeTransaction(actor, (client) => client.query('select id,status from ophanim_knowledge_documents where organization_id is not distinct from $1 and content_hash=$2', [actor?.organizationId ?? null, hash]));
  if (existing.rows[0]) return { ...existing.rows[0], duplicate: true };
  const id = randomUUID(); const storagePath = `${actor?.organizationId ?? 'shared'}/${id}/${fileName}`;
  await storePrivateFile(storagePath, bytes, file.type || 'application/octet-stream');
  try {
    return await knowledgeTransaction(actor, async (client) => {
      const result = await client.query(`insert into ophanim_knowledge_documents
        (id,organization_id,created_by_user_id,file_name,storage_path,mime_type,file_size_bytes,content_hash,language,published_at,valid_from,valid_to,metadata,document_type,shipment_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id,status`,
        [id,actor?.organizationId ?? null,actor?.userId ?? null,fileName,storagePath,file.type || 'application/octet-stream',bytes.length,hash,metadata?.language ?? 'und',metadata?.published_at ?? null,metadata?.valid_from ?? null,metadata?.valid_to ?? null,JSON.stringify(metadata ?? {}),metadata && 'document_type' in metadata ? metadata.document_type ?? 'other':'other',metadata && 'shipment_id' in metadata ? metadata.shipment_id ?? null:null]);
      await client.query('insert into ophanim_knowledge_jobs (organization_id,document_id) values ($1,$2)', [actor?.organizationId ?? null,id]);
      return { ...result.rows[0], duplicate: false };
    });
  } catch (error) {
    await deletePrivateFile(storagePath).catch(() => {});
    if ((error as { code?: string }).code === '23505') {
      const duplicate = await knowledgeTransaction(actor, (client) => client.query('select id,status from ophanim_knowledge_documents where organization_id is not distinct from $1 and content_hash=$2', [actor?.organizationId ?? null,hash]));
      if (duplicate.rows[0]) return { ...duplicate.rows[0], duplicate: true };
    }
    throw error;
  }
}
export async function listDocuments(actor: OrganizationActor | null, page: {limit:number;offset:number} = {limit:100,offset:0}) {
  if(!Number.isInteger(page.limit) || page.limit<1 || page.limit>250 || !Number.isInteger(page.offset) || page.offset<0 || page.offset>100000)throw new KnowledgeInputError('Invalid document page.');
  return knowledgeTransaction(actor, async (client) => {
    const result = await client.query(`select id,organization_id,file_name,file_size_bytes,document_type,language,status,progress,error,
      published_at,valid_from,valid_to,ingested_at,created_at,metadata from ophanim_knowledge_documents
      ${actor ? '' : 'where organization_id is null'} order by created_at desc,id desc limit $1 offset $2`,[page.limit+1,page.offset]);
    const usage = await client.query('select coalesce(sum(file_size_bytes),0)::text as bytes from ophanim_knowledge_documents where organization_id is not distinct from $1', [actor?.organizationId ?? null]);
    const hasMore=result.rows.length>page.limit;
    return { documents: result.rows.slice(0,page.limit), storageBytes: Number(usage.rows[0].bytes),pagination:{...page,hasMore,nextOffset:hasMore ? page.offset+page.limit:null} };
  });
}
export async function queueDeletion(actor: OrganizationActor, id: string) {
  return knowledgeTransaction(actor, async (client) => {
    const result = await client.query("update ophanim_knowledge_documents set status='deleting' where id=$1 and organization_id=$2 returning id", [id,actor.organizationId]);
    if (!result.rows.length) throw new KnowledgeInputError('Document not found or deletion is not permitted.');
    await client.query("insert into ophanim_knowledge_jobs (organization_id,document_id,kind) values ($1,$2,'delete') on conflict (document_id,kind) do update set status='queued',attempts=0,next_attempt_at=now()", [actor.organizationId,id]);
    return { queued: true };
  });
}
