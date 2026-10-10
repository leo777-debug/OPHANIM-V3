import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe,expect,it } from 'vitest';

const tables=['ophanim_knowledge_documents','ophanim_knowledge_chunks','ophanim_knowledge_embeddings','ophanim_knowledge_jobs'];
describe('knowledge additive schema',()=>{
  it('forces RLS on all tables and preserves tenant keys through composite FKs',()=>{
    const sql=readFileSync('db/migrations/025_knowledge.sql','utf8');
    for(const table of tables){expect(sql).toContain(`alter table public.${table} enable row level security`);expect(sql).toContain(`alter table public.${table} force row level security`);}
    expect(sql).toContain('foreign key (document_id, scope_key)');expect(sql).toContain('foreign key (chunk_id, scope_key)');
  });
});
describe.skipIf(!process.env.DATABASE_URL)('knowledge live RLS — requires migrated DATABASE_URL',()=>{
  it('company A cannot retrieve B through raw, lexical or crafted vector queries; shared is visible, writes/links are isolated',async()=>{
    const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
    const a=randomUUID(),b=randomUUID(),ua=randomUUID(),ub=randomUUID(),authA=randomUUID(),authB=randomUUID();
    const docs=[randomUUID(),randomUUID(),randomUUID()],chunks=[randomUUID(),randomUUID(),randomUUID()];
    const vector=`[${[1,...Array(1023).fill(0)].join(',')}]`;
    try{
      await c.query('begin');
      await c.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[authA,`${authA}@example.test`,authB,`${authB}@example.test`]);
      await c.query('insert into ophanim_organizations(id,name,slug) values($1,\'Knowledge A\',$2),($3,\'Knowledge B\',$4)',[a,`k-${a}`,b,`k-${b}`]);
      await c.query('insert into ophanim_users(id,auth_user_id,email) values($1,$2,$3),($4,$5,$6)',[ua,authA,`${ua}@example.test`,ub,authB,`${ub}@example.test`]);
      await c.query('insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,\'analyst\'),($3,$4,\'viewer\')',[a,ua,b,ub]);
      await c.query('set local role ophanim_knowledge_worker');
      for(let i=0;i<3;i++){
        const org=[a,b,null][i]; const metadata=i===2 ? {commercial_use:true,customer_data:false,licence:'CC0',licence_url:'https://example.test/licence',source_url:'https://example.test/source'}:{};
        await c.query(`insert into ophanim_knowledge_documents(id,organization_id,file_name,storage_path,mime_type,file_size_bytes,content_hash,metadata,status) values($1,$2,'test.txt',$3,'text/plain',12,$4,$5,'ready')`,[docs[i],org,`${org ?? 'shared'}/${docs[i]}/test.txt`,String(i+1).repeat(64),JSON.stringify(metadata)]);
        await c.query("insert into ophanim_knowledge_chunks(id,organization_id,document_id,ordinal,content,content_hash,source_file,document_type,language) values($1,$2,$3,0,'crafted tenant secret','hash','test.txt','other','en')",[chunks[i],org,docs[i]]);
        await c.query('insert into ophanim_knowledge_embeddings(chunk_id,organization_id,model,embedding) values($1,$2,\'test\',$3::vector)',[chunks[i],org,vector]);
        await c.query('insert into ophanim_knowledge_jobs(organization_id,document_id) values($1,$2)',[org,docs[i]]);
      }
      await c.query('reset role');await c.query("select set_config('ophanim.user_id',$1,true),set_config('ophanim.organization_id',$2,true)",[ua,a]);await c.query('set local role ophanim_knowledge_app');
      for(const table of tables){const result=await c.query(`select organization_id from ${table}`);expect(result.rows).toHaveLength(2);expect(result.rows.some(r=>r.organization_id===b)).toBe(false);}
      expect((await c.query('select id from ophanim_knowledge_chunks where id=$1',[chunks[1]])).rows).toHaveLength(0);
      expect((await c.query("select id from ophanim_knowledge_chunks where search_vector @@ websearch_to_tsquery('simple','tenant secret')")).rows.map(r=>r.id).sort()).toEqual([chunks[0],chunks[2]].sort());
      expect((await c.query('select chunk_id from ophanim_knowledge_embeddings order by embedding <=> $1::vector',[vector])).rows.map(r=>r.chunk_id).sort()).toEqual([chunks[0],chunks[2]].sort());
      await c.query('savepoint denied');await expect(c.query('update ophanim_knowledge_documents set organization_id=$1 where id=$2',[b,docs[0]])).rejects.toThrow();await c.query('rollback to savepoint denied');
      await c.query('reset role');await c.query("select set_config('ophanim.user_id',$1,true),set_config('ophanim.organization_id',$2,true)",[ub,b]);await c.query('set local role ophanim_knowledge_app');
      expect((await c.query('select id from ophanim_knowledge_chunks where id=$1',[chunks[0]])).rows).toHaveLength(0);
      expect((await c.query('update ophanim_knowledge_documents set status=\'deleting\' where id=$1 returning id',[docs[1]])).rows).toHaveLength(0);
      await c.query('reset role');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[authA]);await c.query('set local role authenticated');
      expect((await c.query('select id from ophanim_knowledge_chunks')).rows.map(r=>r.id).sort()).toEqual([chunks[0],chunks[2]].sort());
      await c.query('reset role');await c.query('set local role ophanim_knowledge_worker');await c.query('savepoint bad_fk');
      await expect(c.query("insert into ophanim_knowledge_chunks(organization_id,document_id,ordinal,content,content_hash,source_file,document_type,language) values($1,$2,2,'x','x','x','other','en')",[a,docs[1]])).rejects.toThrow();await c.query('rollback to savepoint bad_fk');
      await c.query('delete from ophanim_knowledge_documents where id=$1',[docs[0]]);
      for(const table of ['ophanim_knowledge_chunks','ophanim_knowledge_embeddings','ophanim_knowledge_jobs'])expect((await c.query(`select * from ${table} where organization_id=$1`,[a])).rows).toHaveLength(0);
    }finally{await c.query('rollback');await c.end();}
  },30000);
});
