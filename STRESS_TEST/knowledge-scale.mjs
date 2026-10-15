import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Client } from 'pg';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const tenants = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/tenant-context.json'), 'utf8'));
  const own = tenants[0], other = tenants[1];
  const database = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await database.connect();
  const checks = [];
  const prefix = 'Synthetic scale document ', suffix = '. No customer data.';
  try {
    const added = await database.query(`insert into ophanim_knowledge_documents(organization_id,created_by_user_id,file_name,storage_path,mime_type,file_size_bytes,content_hash,status,metadata)
      select $1::uuid,$2::uuid,'SYNTHETIC-DOC-'||i::text||'.txt',$1::text||'/scale/'||i::text||'.txt','text/plain',length($3||i::text||$4),encode(digest($3||i::text||$4,'sha256'),'hex'),'ready',jsonb_build_object('scale_index',i,'synthetic_fixture',true)
      from generate_series(1,1000) i returning id,storage_path,metadata`, [own.organizationId, own.userId, prefix, suffix]);
    const storage = resolve(root, 'STRESS_TEST/runtime/private-files');
    await mkdir(resolve(storage, own.organizationId, 'scale'), { recursive: true });
    for (const document of added.rows) {
      const file = resolve(storage, document.storage_path);
      if (!file.startsWith(storage + sep)) throw new Error('Fixture file escaped private test storage.');
      await writeFile(file, prefix + document.metadata.scale_index + suffix);
    }
    await database.query(`insert into ophanim_knowledge_chunks(organization_id,document_id,ordinal,content,content_hash,source_file,document_type,language)
      select organization_id,id,0,$2||(metadata->>'scale_index')||$3,content_hash,file_name,'other','en' from ophanim_knowledge_documents
      where organization_id=$1 and metadata->>'synthetic_fixture'='true'`, [own.organizationId, prefix, suffix]);
    const headers = { Cookie: `ophanim_session=${own.token}`, Origin: base, 'Content-Type': 'application/json' };
    const started = performance.now();
    const listed = await fetch(`${base}/api/knowledge/documents`, { headers });
    const list = await listed.json();
    checks.push({ check: '1000 private documents list is bounded and tenant-scoped', elapsedMs: Math.round(performance.now() - started), returned: list.documents?.length, pass: listed.status === 200 && list.documents?.length === 500 && !JSON.stringify(list).includes(other.marker), limitation: '500-record cap has no continuation controls; P2 remains open.' });
    const selected = added.rows.at(-1);
    const downloaded = await fetch(`${base}/api/knowledge/documents/${selected.id}?download=1`, { headers });
    checks.push({ check: 'real private file from the 1000-document fixture downloads correctly', pass: downloaded.status === 200 && await downloaded.text() === prefix + selected.metadata.scale_index + suffix });
    const searchStart = performance.now();
    const searched = await fetch(`${base}/api/knowledge/search`, { method: 'POST', headers, body: JSON.stringify({ question: 'Synthetic scale document', filters: {} }) });
    const search = await searched.json();
    checks.push({ check: 'bounded full-text retrieval works with embeddings unavailable', elapsedMs: Math.round(performance.now() - searchStart), returned: search.chunks?.length, pass: searched.status === 200 && search.chunks?.length === 8 && Boolean(search.warning) && search.chunks.every((chunk) => chunk.content.startsWith(prefix)) });
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/knowledge-scale.json'), JSON.stringify({ checkedAt: new Date().toISOString(), database: 'embedded PostgreSQL with pgvector; sequential scale, not native vector concurrency', records: 1000, privateFiles: 1000, chunks: 1000, scope: 'Seeded synthetic post-extraction fixtures; not 1000 extractor/embedding jobs.', checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((item) => item.pass).length, failed: checks.filter((item) => !item.pass) }));
    if (checks.some((item) => !item.pass)) process.exitCode = 1;
  } finally { await database.end(); }
}, { databaseArgs: ['--tenant-fixtures'] });
