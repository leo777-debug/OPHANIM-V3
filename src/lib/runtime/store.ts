import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/pool';

export type RuntimeStorage = 'postgres' | 'local-file' | 'memory';
export type RuntimeRead<T> = { items: Record<string, T>; storage: RuntimeStorage; warning?: string };
const memory = new Map<string, Record<string, unknown>>();
let queue = Promise.resolve();
function valid(value: string) { if (!/^[a-z0-9][a-z0-9_.:-]{0,239}$/i.test(value)) throw new Error('Invalid runtime record identifier.'); }
function directory() { return process.env.OPHANIM_RUNTIME_DIR || (process.env.VERCEL ? null : path.join(process.cwd(), '.ophanim-runtime')); }

/** Internal public-source metadata. Do not use this store for tenant documents or credentials. */
export async function readRuntimeScope<T>(scope: string): Promise<RuntimeRead<T>> {
  valid(scope);
  if (process.env.DATABASE_URL) {
    try {
      const result = await db().query<{ id: string; value: T }>('select id,value from ophanim_runtime.entries where scope=$1', [scope]);
      return { items: Object.fromEntries(result.rows.map(row => [row.id, row.value])), storage: 'postgres' };
    } catch { return { items: (memory.get(scope) ?? {}) as Record<string, T>, storage: 'memory', warning: 'Persistent runtime storage unavailable. Apply the parity runtime migration; observations are currently process-local.' }; }
  }
  const root = directory();
  if (root) {
    try { return { items: JSON.parse(await readFile(path.join(root, `${scope}.json`), 'utf8')) as Record<string, T>, storage: 'local-file' }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { items: {}, storage: 'local-file' }; }
  }
  return { items: (memory.get(scope) ?? {}) as Record<string, T>, storage: 'memory', warning: 'No writable persistent store. These observations clear on restart.' };
}
export async function writeRuntimeValue<T>(scope: string, id: string, value: T): Promise<{ storage: RuntimeStorage; warning?: string }> {
  valid(scope); valid(id);
  memory.set(scope, { ...memory.get(scope), [id]: value });
  if (process.env.DATABASE_URL) {
    try { await db().query('insert into ophanim_runtime.entries(scope,id,value) values($1,$2,$3) on conflict(scope,id) do update set value=excluded.value,updated_at=now()', [scope, id, JSON.stringify(value)]); return { storage: 'postgres' }; }
    catch { return { storage: 'memory', warning: 'Runtime database write failed; apply the runtime migration. Observation is process-local.' }; }
  }
  const root = directory();
  if (!root) return { storage: 'memory', warning: 'Configure DATABASE_URL or OPHANIM_RUNTIME_DIR for persistent observations.' };
  let result: { storage: RuntimeStorage; warning?: string } = { storage: 'local-file' };
  const operation = queue.then(async () => {
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const current = await readRuntimeScope<T>(scope);
      const temporary = path.join(root, `${scope}.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify({ ...current.items, [id]: value }), { mode: 0o600 });
      await rename(temporary, path.join(root, `${scope}.json`));
    } catch { result = { storage: 'memory', warning: 'Runtime filesystem write failed; observation is process-local.' }; }
  });
  queue = operation.catch(() => {}); await operation; return result;
}

/** Atomic first-observation register. Only public source identities and UTC times belong here. */
export async function recordRuntimeFirstSeen(scope: string, ids: string[], observedAt: string): Promise<RuntimeRead<string>> {
  valid(scope); ids = [...new Set(ids)]; ids.forEach(valid);
  const parsed = Date.parse(observedAt);
  if (!Number.isFinite(parsed)) throw new Error('Valid observation time required.');
  const time = new Date(parsed).toISOString();
  if (!ids.length) return { items: {}, storage: process.env.DATABASE_URL ? 'postgres' : directory() ? 'local-file' : 'memory' };
  const remember = (existing: Record<string, string>) => Object.fromEntries(ids.map(id => [id, existing[id] && existing[id] < time ? existing[id] : time]));
  if (process.env.DATABASE_URL) {
    try {
      const result = await db().query<{ id: string; value: string }>(
        `insert into ophanim_runtime.entries(scope,id,value)
         select $1,id,to_jsonb($3::text) from unnest($2::text[]) as id
         on conflict(scope,id) do update set
           value=to_jsonb(least(ophanim_runtime.entries.value #>> '{}', excluded.value #>> '{}')),
           updated_at=now()
         returning id,value`, [scope, ids, time]);
      return { items: Object.fromEntries(result.rows.map(row => [row.id, row.value])), storage: 'postgres' };
    } catch {
      const items = remember((memory.get(scope) ?? {}) as Record<string, string>);
      memory.set(scope, { ...memory.get(scope), ...items });
      return { items, storage: 'memory', warning: 'First-seen database unavailable; current observations are process-local.' };
    }
  }
  let result: RuntimeRead<string> = { items: {}, storage: 'memory' };
  const operation = queue.then(async () => {
    const current = await readRuntimeScope<string>(scope);
    const items = remember(current.items), all = { ...current.items, ...items };
    memory.set(scope, all);
    const root = directory();
    if (root) {
      try {
        await mkdir(root, { recursive: true, mode: 0o700 });
        const temporary = path.join(root, `${scope}.${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(all), { mode: 0o600 });
        await rename(temporary, path.join(root, `${scope}.json`));
        result = { items, storage: 'local-file' }; return;
      } catch { /* Return the actual memory fallback below. */ }
    }
    result = { items, storage: 'memory', warning: 'First-seen observations are process-local; configure persistent runtime storage.' };
  });
  queue = operation.catch(() => {}); await operation; return result;
}
