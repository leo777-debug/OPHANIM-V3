import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { endpointPolicies } from './endpoint-policy.mjs';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const tenants = JSON.parse(await readFile(resolve(root,'STRESS_TEST/runtime/tenant-context.json'),'utf8'));
  const database = new Client({ connectionString:'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await database.connect();
  const checks = [];
  const tables = (await database.query("select table_name from information_schema.columns where table_schema='public' and column_name='organization_id' order by table_name")).rows.map(row=>row.table_name);
  const snapshot = async organization => {
    const rows = [];
    for (const table of tables) {
      if (!/^ophanim_[a-z0-9_]+$/.test(table)) throw new Error('Unexpected fixture table identifier');
      const result = await database.query(`select row_to_json(t)::text as value from public."${table}" t where organization_id=$1 order by row_to_json(t)::text`,[organization]);
      rows.push([table,result.rows]);
    }
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  };
  try {
    // Keep demo resets until both directions have probed the seeded foreign IDs.
    for (const destructive of [false,true]) for (let index=0; index<2; index++) {
      const actor = tenants[index], other = tenants[1-index];
      const before = await snapshot(other.organizationId);
      for (const endpoint of endpointPolicies(root).filter(item=>item.policy==='member' && /^\/api\/platform\/demo\/(reset|seed)$/.test(item.path)===destructive)) {
        const type = endpoint.path.includes('imports/') ? 'import' : endpoint.path.includes('shipments/') ? 'shipment' : endpoint.path.includes('documents/') ? 'document' : endpoint.path.includes('/platform/cases/') ? 'case' : endpoint.path.includes('entities/') ? 'entity' : endpoint.path.includes('events/') ? 'event' : null;
        const target = type ? other.records[type] : '11111111-1111-4111-8111-111111111111';
        const path = endpoint.path.replace(/\[[^\]]+\]/g,target);
        const response = await fetch(base+path,{ method:endpoint.method,signal:AbortSignal.timeout(30000),
          headers:{cookie:`ophanim_session=${actor.token}; ophanim_organization=${other.organizationId}`,origin:base,'content-type':'application/json'},
          ...(['GET','HEAD','OPTIONS'].includes(endpoint.method)?{}:{body:JSON.stringify({organizationId:other.organizationId,userId:other.userId,shipmentId:other.records.shipment,entityId:other.records.entity,caseId:other.records.case,confirmed:false,confirm:false})}),
        });
        let text='';
        const streaming = response.headers.get('content-type')?.includes('text/event-stream');
        if (streaming) await response.body?.cancel(); else text=await response.text();
        const foreignRecord = Boolean(type && endpoint.path.includes('['));
        const safeEmptyChild = endpoint.method==='GET' && endpoint.path.endsWith('/correlations') && response.status===200 && JSON.stringify(JSON.parse(text))==='{"correlations":[]}';
        const pass = !text.includes(other.marker) && (!foreignRecord || [400,403,404].includes(response.status) || safeEmptyChild) && response.status!==500;
        checks.push({...endpoint,direction:index?'B to A':'A to B',status:response.status,pass,probe:type?'seeded foreign core ID':'foreign organization/body plus missing-ID probe',streaming:streaming?'cancelled; dedicated SDK tenant suite checks contents':undefined});
      }
      checks.push({check:'Every foreign organization-owned table unchanged',phase:destructive?'demo resets last':'foreign ID probes',direction:index?'B to A':'A to B',tables:tables.length,pass:before===await snapshot(other.organizationId)});
    }
    await writeFile(resolve(root,'STRESS_TEST/artifacts/endpoint-tenant-sweep.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Every member handler in both directions, forged workspace cookie and foreign ID/body probes; actual HTTP and unchanged-table digests. Dedicated workflow suites supply valid own-write controls. Not exhaustive payload permutations.',checks},null,2));
    console.log(JSON.stringify({total:checks.length,passed:checks.filter(check=>check.pass).length,failed:checks.filter(check=>!check.pass)}));
    if(checks.some(check=>!check.pass))process.exitCode=1;
  } finally { await database.end(); }
},{databaseArgs:['--tenant-fixtures']});
