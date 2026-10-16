import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Client } from 'pg';
import { withIsolatedApp } from './harness.mjs';
import { chromium } from '@playwright/test';

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
    checks.push({ check: '1000 private documents list is bounded and tenant-scoped', elapsedMs: Math.round(performance.now() - started), returned: list.documents?.length, pass: listed.status === 200 && list.documents?.length === 100 && list.pagination?.hasMore && !JSON.stringify(list).includes(other.marker) });
    const seen=new Set(list.documents.map(document=>document.id));let cursor=list.pagination.nextOffset,pages=1;
    while(cursor!==null && pages<20){
      const response=await fetch(`${base}/api/knowledge/documents?limit=100&offset=${cursor}`,{headers});
      const body=await response.json();if(!response.ok || body.documents.some(document=>seen.has(document.id)))throw new Error('Document pagination duplicates or fails.');
      for(const document of body.documents)seen.add(document.id);
      cursor=body.pagination.nextOffset;pages++;
    }
    checks.push({check:'all 1000 scale documents and original tenant document reachable without duplication',pages,returned:seen.size,pass:cursor===null && seen.size===1001 && added.rows.every(document=>seen.has(document.id))});
    const selected = added.rows.at(-1);
    const downloaded = await fetch(`${base}/api/knowledge/documents/${selected.id}?download=1`, { headers });
    checks.push({ check: 'real private file from the 1000-document fixture downloads correctly', pass: downloaded.status === 200 && await downloaded.text() === prefix + selected.metadata.scale_index + suffix });
    const searchStart = performance.now();
    const searched = await fetch(`${base}/api/knowledge/search`, { method: 'POST', headers, body: JSON.stringify({ question: 'Synthetic scale document', filters: {} }) });
    const search = await searched.json();
    checks.push({ check: 'bounded full-text retrieval works with embeddings unavailable', elapsedMs: Math.round(performance.now() - searchStart), returned: search.chunks?.length, pass: searched.status === 200 && search.chunks?.length === 8 && Boolean(search.warning) && search.chunks.every((chunk) => chunk.content.startsWith(prefix)) });
    const browser=await chromium.launch({headless:true});
    try{
      for(const width of [390,1920]){
        const context=await browser.newContext({viewport:{width,height:1080}});
        await context.addCookies([{name:'ophanim_session',value:own.token,url:base,httpOnly:true,sameSite:'Lax'}]);
        await context.route('**/*',route=>new URL(route.request().url()).origin===base ? route.continue():route.abort());
        const page=await context.newPage();await page.goto(`${base}/knowledge`);
        const next=page.getByRole('button',{name:'Next document page',exact:true});
        await page.waitForFunction(()=>document.querySelector('button[aria-label="Next document page"]')?.disabled===false);
        const before=await page.locator('tbody tr').first().textContent();await next.click();
        await page.waitForFunction(()=>document.querySelector('nav[aria-label="Document pages"]')?.textContent?.includes('101-200'));
        const changed=before!==await page.locator('tbody tr').first().textContent();
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
        checks.push({check:'actual document pagination controls',width,changed,overflow,pass:changed && !overflow});
        await page.screenshot({path:resolve(root,`STRESS_TEST/artifacts/knowledge-pagination-${width}.png`),fullPage:true});
        await context.close();
      }
    }finally{await browser.close();}
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/knowledge-scale-paginated.json'), JSON.stringify({ checkedAt: new Date().toISOString(), database: 'embedded PostgreSQL with pgvector; sequential scale, not native vector concurrency', records: 1000, privateFiles: 1000, chunks: 1000, scope: 'Seeded synthetic post-extraction fixtures; not 1000 extractor/embedding jobs.', checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((item) => item.pass).length, failed: checks.filter((item) => !item.pass) }));
    if (checks.some((item) => !item.pass)) process.exitCode = 1;
  } finally { await database.end(); }
}, { databaseArgs: ['--tenant-fixtures'] });
