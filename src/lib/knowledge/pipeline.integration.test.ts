import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { OrganizationActor } from '@/lib/operations/types';

const state = vi.hoisted(()=>({client:null as null | Pick<PoolClient,'query'>}));
// Only connection acquisition is substituted. Production transactions, SQL,
// RLS, private disk storage, Python extraction and HTTP embeddings all execute.
vi.mock('@/lib/db/pool',()=>({db:()=>({connect:async()=>({...state.client,release:()=>{}})})}));
vi.mock('@/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>null}));
import { createIsolatedClient } from './isolated-db.test-helper';
import { addDocument, queueDeletion } from './documents';
import { runKnowledgeJobs } from './jobs';
import { searchKnowledge } from './search';
import { knowledgeTransaction } from './database';

const enabled=process.env.OPHANIM_TEST_PGLITE==='1' && Boolean(process.env.EMBEDDING_BASE_URL);
describe.skipIf(!enabled)('knowledge real local pipeline — explicit isolated DB and embedding server',()=>{
  let client:Awaited<ReturnType<typeof createIsolatedClient>>;
  let storage:string;
  const a:OrganizationActor={organizationId:randomUUID(),userId:randomUUID(),role:'owner'};
  const b:OrganizationActor={organizationId:randomUUID(),userId:randomUUID(),role:'owner'};
  const report:{[key:string]:unknown}={environment:'PostgreSQL WASM, real pgvector, real Python extraction, real CPU Qwen embeddings',customer_data:false};
  beforeAll(async()=>{
    client=await createIsolatedClient();
    state.client=client as unknown as Pick<PoolClient,'query'>;
    const root=process.env.OPHANIM_MODELS_DIR ?? 'D:\\models';
    await mkdir(path.join(root,'eval'),{recursive:true});
    storage=await mkdtemp(path.join(root,'eval','knowledge-private-'));
    vi.stubEnv('KNOWLEDGE_STORAGE_DIR',storage);
    for(const actor of [a,b]){
      await client.query('insert into ophanim_organizations(id,name,slug) values($1,$2,$3)',[actor.organizationId,'Synthetic pipeline',actor.organizationId]);
      await client.query('insert into ophanim_users(id,email) values($1,$2)',[actor.userId,`${actor.userId}@example.test`]);
      await client.query("insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,'owner')",[actor.organizationId,actor.userId]);
    }
  },30000);
  afterAll(async()=>{
    if(client)await client.end();
    if(storage)await rm(storage,{recursive:true,force:true}); // Exact mkdtemp directory, owned by this test.
    vi.unstubAllEnvs();
    const folder=path.join(process.env.OPHANIM_MODELS_DIR ?? 'D:\\models','eval');
    await writeFile(path.join(folder,'rag-pipeline-report.json'),JSON.stringify(report,null,2));
  });
  it('ingests independently, retrieves bilingually with date filters, rejects other tenants, deduplicates and deletes embeddings',async()=>{
    const start=performance.now();
    const file=(name:string,text:string)=>new File([text],name,{type:'text/plain'});
    const now=new Date().toISOString();
    const current={published_at:now,valid_from:'2026-01-01',language:'en'};
    const own=await addDocument(a,file('packing-list.txt','Synthetic shipment SYN-A: the packing list contains 48 boxes. Gross weight is 960 kg.'),{...current,document_type:'packing_list'});
    const foreign=await addDocument(b,file('company-b.txt','Confidential synthetic shipment SYN-B contains 777 boxes. Company B secret marker: BLUE-PRIVATE.'),current);
    const arabic=await addDocument(a,file('arabic-shipment.txt','سجل خيالي: تحتوي الشحنة العربية SYN-AR على ٢٤ صندوقاً. الوزن الإجمالي ٤٨٠ كيلوغراماً.'),{...current,language:'ar'});
    const old=await addDocument(a,file('old-cutoff.txt','Synthetic historical contract: the booking cutoff for SYN-HISTORY was Tuesday at 14:00 UTC.'),{published_at:'2021-01-01',valid_from:'2021-01-01',valid_to:'2021-12-31',language:'en'});
    const shared=await addDocument(null,file('shared-sop.txt','Synthetic shared guidance: inspect damaged packages and record the seal number before cargo release.'),
      {...current,valid_to:null,source:'Ophanim synthetic fixture',source_url:'https://example.test/synthetic',licence:'MIT',licence_url:'https://opensource.org/license/mit',commercial_use:true,customer_data:false,reviewed_at:'2026-10-10',region:'Synthetic',attribution:'Ophanim',knowledge_period:'present'});
    const damaged=await addDocument(a,file('damaged.pdf','This is intentionally an invalid synthetic PDF.'),current);
    expect((await addDocument(a,file('renamed-copy.txt','Synthetic shipment SYN-A: the packing list contains 48 boxes. Gross weight is 960 kg.'),current)).duplicate).toBe(true);
    const ingested=await runKnowledgeJobs(10);
    const elapsed=(performance.now()-start)/1000;
    report.file_statuses=(await knowledgeTransaction(null,c=>c.query('select file_name,status,error from ophanim_knowledge_documents'))).rows;
    if(ingested.completed!==5)console.log(report.file_statuses);
    expect(ingested.completed).toBe(5);expect(ingested.failed).toBe(1);
    const rows=await knowledgeTransaction(a,c=>c.query('select id,status,error from ophanim_knowledge_documents'));
    expect(rows.rows.find(r=>r.id===damaged.id)?.error).toBeTruthy();
    expect(rows.rows.some(r=>r.id===foreign.id)).toBe(false);
    const queries=[
      {question:'How many boxes are in synthetic shipment SYN-A?',expected:own.id,filters:{}},
      {question:'What is the gross weight of shipment SYN-A?',expected:own.id,filters:{}},
      {question:'كم عدد صناديق الشحنة العربية SYN-AR؟',expected:arabic.id,filters:{}},
      {question:'How many packages does the Arabic shipment SYN-AR contain?',expected:arabic.id,filters:{}},
      {question:'What should be inspected before cargo release?',expected:shared.id,filters:{}},
      {question:'What was the booking cutoff for SYN-HISTORY?',expected:old.id,filters:{asOf:'2021-06-01'}},
    ];
    const results=[];
    for(const item of queries){
      const started=performance.now();const retrieved=await searchKnowledge(a,item.question,item.filters);
      expect(retrieved.warning).toBeNull();expect(retrieved.chunks.some(c=>c.document_id===foreign.id)).toBe(false);
      const rank=retrieved.chunks.findIndex(c=>c.document_id===item.expected)+1;
      results.push({question:item.question,rank,latency_s:(performance.now()-started)/1000});
      expect(rank).toBeGreaterThan(0);
    }
    const currentOnly=await searchKnowledge(a,'booking cutoff SYN-HISTORY',{currentOnly:true});
    expect(currentOnly.chunks.some(c=>c.document_id===old.id)).toBe(false);
    const attack=await searchKnowledge(a,'BLUE-PRIVATE Company B confidential SYN-B 777');
    expect(attack.chunks.some(c=>c.document_id===foreign.id || c.content.includes('BLUE-PRIVATE'))).toBe(false);
    await queueDeletion(a,own.id);const deletion=await runKnowledgeJobs(1);expect(deletion.completed).toBe(1);
    const remaining=await knowledgeTransaction(a,c=>c.query('select c.id from ophanim_knowledge_chunks c join ophanim_knowledge_embeddings e on e.chunk_id=c.id where c.document_id=$1',[own.id]));
    expect(remaining.rows).toHaveLength(0);
    report.ingestion={files_ready:5,files_failed_independently:1,elapsed_s:elapsed,files_per_minute:5/elapsed*60};
    report.retrieval={questions:results,recall_at_8:results.filter(r=>r.rank>0&&r.rank<=8).length/results.length,
      recall_at_3:results.filter(r=>r.rank>0&&r.rank<=3).length/results.length,
      mean_reciprocal_rank:results.reduce((sum,r)=>sum+(r.rank?1/r.rank:0),0)/results.length};
    report.tenant_isolation_passed=true;report.current_filter_passed=true;report.deduplication_passed=true;report.deletion_cascade_passed=true;
    report.limitations=['Six synthetic retrieval questions over five readable files; not a production retrieval benchmark.',
      'Supabase storage service and concurrent worker locks require native deployment tests.'];
  },240000);
});
