import { randomUUID } from 'node:crypto';
import { knowledgeTransaction } from './database';
import { deletePrivateFile, readPrivateFile } from './storage';
import { extractDocument } from './extract';
import { embedTexts, vectorLiteral } from './embeddings';
import { getEmbeddingSettings } from './settings';
import { hashContent, splitBlocks, validateSharedMetadata } from './safety';

interface Job { id: string; document_id: string; attempts: number; kind: string }
interface Document { organization_id: string | null; file_name: string; storage_path: string; content_hash: string; document_type: string; language: string; published_at: string | null; valid_from: string | null; valid_to: string | null; metadata: unknown; status: string }

export async function runKnowledgeJobs(limit = 3) {
  const summary = { processed: 0, completed: 0, failed: 0 };
  await knowledgeTransaction(null,async(c)=>{
    await c.query(`update ophanim_knowledge_documents
      set metadata=jsonb_set(metadata,'{knowledge_period}','"past"'::jsonb)
      where organization_id is null and metadata->>'knowledge_period'='present'
        and published_at<now()-interval '30 days'`);
    // A crash during the last attempt must become visible instead of remaining
    // in processing forever after the lease expires.
    await c.query(`with exhausted as (
      update ophanim_knowledge_jobs set status='failed',last_error='Worker lease expired after three attempts'
      where status='running' and attempts>=3 and locked_at<now()-interval '20 minutes'
      returning document_id
    ) update ophanim_knowledge_documents set status='failed',error='Worker lease expired after three attempts'
      where id in (select document_id from exhausted) and status<>'deleting'`);
  });
  for (let i=0; i<limit; i++) {
    const job = await knowledgeTransaction(null, async (client) => {
      const result = await client.query<Job>(`with candidate as (
        select id from ophanim_knowledge_jobs where attempts<3 and (
          (status='queued' and next_attempt_at<=now()) or (status='running' and locked_at<now()-interval '20 minutes'))
        order by case kind when 'delete' then 0 else 1 end,created_at for update skip locked limit 1
      ) update ophanim_knowledge_jobs j set status='running',locked_at=now(),attempts=attempts+1
        from candidate where j.id=candidate.id returning j.*`);
      return result.rows[0];
    });
    if (!job) break;
    summary.processed++;
    try {
      const document = await knowledgeTransaction(null, async (c) => (await c.query<Document>('select * from ophanim_knowledge_documents where id=$1',[job.document_id])).rows[0]);
      if (!document) continue;
      if (job.kind === 'delete') {
        await deletePrivateFile(document.storage_path);
        await knowledgeTransaction(null, (c) => c.query('delete from ophanim_knowledge_documents where id=$1',[job.document_id]));
        summary.completed++; continue;
      }
      if (document.status === 'deleting') {
        await knowledgeTransaction(null,(c)=>c.query("update ophanim_knowledge_jobs set status='completed' where id=$1",[job.id]));
        continue;
      }
      if (document.organization_id === null) validateSharedMetadata(document.metadata);
      await knowledgeTransaction(null,(c)=>c.query("update ophanim_knowledge_documents set status='processing',progress=5,error=null where id=$1 and status<>'deleting'",[job.document_id]));
      const bytes = await readPrivateFile(document.storage_path);
      if (hashContent(bytes) !== document.content_hash) throw new Error('Private file checksum mismatch.');
      const chunks = splitBlocks(await extractDocument(document.file_name,bytes));
      if (!chunks.length || chunks.length>2000) throw new Error('Document has no safe readable text or exceeds 2,000 chunks.');
      const language = document.language === 'und' ? (/\p{Script=Arabic}/u.test(chunks.map(c=>c.text).join('')) ? 'ar' : 'en') : document.language;
      // Compute outside a database transaction; insert everything atomically only
      // once all embeddings have succeeded, so retries cannot leave partial data.
      const vectors: number[][] = [];
      const settings=await getEmbeddingSettings(document.organization_id);
      for (let offset=0; offset<chunks.length; offset+=8) {
        vectors.push(...await embedTexts(chunks.slice(offset,offset+8).map(c=>c.text),settings));
        await knowledgeTransaction(null,(c)=>c.query("update ophanim_knowledge_documents set progress=$2 where id=$1 and status<>'deleting'",[job.document_id,Math.floor(20+70*vectors.length/chunks.length)]));
        await knowledgeTransaction(null,(c)=>c.query('update ophanim_knowledge_jobs set locked_at=now() where id=$1',[job.id]));
      }
      await knowledgeTransaction(null,async (c)=>{
        const locked = await c.query('select status from ophanim_knowledge_documents where id=$1 for update',[job.document_id]);
        if (!locked.rows[0] || locked.rows[0].status==='deleting') return;
        await c.query('delete from ophanim_knowledge_chunks where document_id=$1',[job.document_id]);
        for (let index=0; index<chunks.length; index++) {
          const id=randomUUID(); const chunk=chunks[index];
          await c.query(`insert into ophanim_knowledge_chunks
            (id,organization_id,document_id,ordinal,content,content_hash,source_file,reference,document_type,language,published_at,valid_from,valid_to)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [id,document.organization_id,job.document_id,index,chunk.text,hashContent(chunk.text),document.file_name,JSON.stringify(chunk.reference),document.document_type,language,document.published_at,document.valid_from,document.valid_to]);
          await c.query('insert into ophanim_knowledge_embeddings (chunk_id,organization_id,model,embedding) values ($1,$2,$3,$4::vector)',[id,document.organization_id,settings.model,vectorLiteral(vectors[index])]);
        }
        await c.query("update ophanim_knowledge_documents set status='ready',progress=100,ingested_at=now(),language=$2 where id=$1",[job.document_id,language]);
        await c.query("update ophanim_knowledge_jobs set status='completed' where id=$1",[job.id]);
      });
      summary.completed++;
    } catch (error) {
      summary.failed++;
      const message = (error instanceof Error ? error.message : 'Ingestion failed').slice(0,500);
      await knowledgeTransaction(null,async(c)=>{
        await c.query("update ophanim_knowledge_jobs set status=$2,last_error=$3,next_attempt_at=now()+interval '2 minutes' where id=$1",[job.id,job.attempts<3 ? 'queued':'failed',message]);
        await c.query("update ophanim_knowledge_documents set status=$2,error=$3 where id=$1 and status<>'deleting'",[job.document_id,job.attempts<3 ? 'queued':'failed',message]);
      });
    }
  }
  return summary;
}
