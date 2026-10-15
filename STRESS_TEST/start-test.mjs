import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
// Do not inherit provider/database keys from a developer's shell.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES|PROGRAMFILES\(X86\)|NUMBER_OF_PROCESSORS)$/i.test(key)));
Object.assign(env, {
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', OPHANIM_STRESS_ISOLATED: '1',
  DATABASE_URL: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable',
  APP_URL: 'http://127.0.0.1:3100',
  HOSTNAME: '127.0.0.1', PORT: '3100',
  KNOWLEDGE_STORAGE_DIR: resolve(root, 'STRESS_TEST/runtime/private-files'),
  AI_LOCAL_BASE_URLS: 'http://127.0.0.1:3155',
  IMPORT_CRON_SECRET: 'synthetic-stress-import-cron',
  NODE_OPTIONS: `--require "${resolve(root, 'STRESS_TEST/network-guard.cjs').replaceAll('\\', '/')}"`,
});
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (existsSync(resolve(root, name))) throw new Error('Isolated checkout must not contain a local/production environment file.');
}
if (JSON.parse(readFileSync(resolve(root, 'STRESS_TEST/state.json'), 'utf8')).branch !== 'stress-test/competition') throw new Error('Unexpected checkpoint branch.');
export function startTestApp(stdio = 'inherit', standalone = process.argv.includes('--standalone'), port = 3100) {
  if (![3100, 3101].includes(port)) throw new Error('Only owned stress-test ports are supported.');
  const buildDirectory = process.env.OPHANIM_STRESS_BUILD_DIR ?? '.next';
  if (!['.next', '.next-stress-final'].includes(buildDirectory)) throw new Error('Unexpected stress build directory.');
  const childEnv = { ...env, NEXT_DEV_DIST_DIR: buildDirectory, PORT: String(port), APP_URL: `http://127.0.0.1:${port}` };
  const replayContext=JSON.parse(readFileSync(resolve(root,'STRESS_TEST/runtime/demo-context.json'),'utf8'));
  childEnv.OPHANIM_DEMO_REPLAY_CREATED_AT=replayContext.createdAt ?? new Date().toISOString();
  if(process.argv.includes('--sdk-fixture')) {
    const demo=JSON.parse(readFileSync(resolve(root,'STRESS_TEST/runtime/demo-context.json'),'utf8'));
    childEnv.SDK_INGEST_KEY='synthetic-owned-sdk-fixture-only';
    childEnv.SDK_INGEST_ORGANIZATION_ID=demo.organizationId;
  }
  if (!standalone) return spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: childEnv, stdio, windowsHide: true });
  const output = resolve(root, buildDirectory, 'standalone');
  if (!existsSync(resolve(output, 'server.js'))) throw new Error('Run npm run build before the isolated smoke test.');
  cpSync(resolve(root, 'public'), resolve(output, 'public'), { recursive: true });
  cpSync(resolve(root, buildDirectory, 'static'), resolve(output, buildDirectory, 'static'), { recursive: true });
  return spawn(process.execPath, [resolve(output, 'server.js')], { cwd: root, env: childEnv, stdio, windowsHide: true });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const child = startTestApp();
  child.once('exit', (code) => { process.exitCode = code ?? 1; });
  const stop = () => child.kill('SIGTERM');
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
