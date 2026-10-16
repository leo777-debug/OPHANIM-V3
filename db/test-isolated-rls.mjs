// Disposable real PostgreSQL (WASM) + pgvector. Never reads production env.
// One connection/test worker: this checks policies, not multiprocess locking.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The test uses PGlite directly. Its optional socket adapter mishandles
// expected SQL errors/savepoint recovery, so it cannot prove these policies.
const url = 'postgresql://isolated-test-only';
const args = ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=1', '--no-file-parallelism',
  'src/lib/knowledge/rls.integration.test.ts', 'src/lib/verify/rls.integration.test.ts',
  'src/lib/supabase/competition-rls.integration.test.ts', ...process.argv.slice(2)];
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: repo, stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, OPHANIM_TEST_PGLITE: '1', NODE_ENV: 'test' } });
  child.on('error', reject); child.on('exit', resolve);
});
process.exitCode = code ?? 1;
