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
