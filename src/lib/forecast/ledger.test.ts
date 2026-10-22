import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';

describe('Panel migrations execute with tenant RLS and immutable evidence',()=>{
 let pg:PGlite;
 beforeAll(async()=>{
  const { pgcrypto }=await import('@electric-sql/pglite/contrib/pgcrypto');
  // Parity's knowledge migration (025_knowledge.sql) needs pgvector when the whole schema is applied.
  const { vector }=await import('@electric-sql/pglite-pgvector');
  pg=new PGlite({extensions:{pgcrypto,vector}});
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);alter table storage.objects enable row level security;
   create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
   create table ophanim_schema_migrations(name text primary key,checksum text not null,applied_at timestamptz default now());`);
  const {readdir}=await import('node:fs/promises');const files=[];
  for(const directory of ['db/migrations','supabase/migrations'])for(const name of await readdir(directory))if(name.endsWith('.sql'))files.push({directory,name});
  for(const f of files.sort((a,b)=>a.name.localeCompare(b.name)))await pg.exec(await readFile(`${f.directory}/${f.name}`,'utf8'));
  await pg.exec(await readFile('supabase/tests/forecast_tenant_isolation.test.sql','utf8'));
 },60000);
 afterAll(async()=>{await pg?.close();});
 it('executes all SQL tenant and ledger assertions',async()=>{
  expect((await pg.query('select count(*)::int as n from ophanim_forecasts')).rows).toEqual([{n:0}]);
 });
});
