import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { Client } from 'pg';
import { startTestApp } from './start-test.mjs';

export async function withRunningSoakDatabase(run) {
  const root = resolve(import.meta.dirname, '..');
  const context = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const soak = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/artifacts/soak.json'), 'utf8'));
  if (soak.finished || !context.directory?.startsWith(resolve(root, 'STRESS_TEST/runtime') + sep)) throw new Error('No owned native soak database is running.');
  if (Math.abs(Date.now() - new Date(soak.startedAt).getTime() - soak.elapsedSeconds * 1000) > 90000) throw new Error('Soak checkpoint is stale; refusing to reuse the database.');
  const database = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable' });
  await database.connect();
  try {
    const actual = (await database.query('show data_directory')).rows[0].data_directory;
    if (resolve(actual) !== resolve(context.directory)) throw new Error('Database directory does not match the owned soak context.');
  } finally { await database.end(); }
  await new Promise((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(3101, '127.0.0.1', () => probe.close(resolve)); });
  const app = startTestApp(['ignore', 'pipe', 'pipe'], false, 3101);
  app.stderr.on('data', () => {});
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned browser test server did not start.')), 30000);
      app.stdout.on('data', (data) => { if (data.toString().includes('Ready in')) { clearTimeout(timer); resolve(); } });
      app.once('exit', () => { clearTimeout(timer); reject(new Error('Owned browser test server exited.')); });
    });
    return await run({ base: 'http://127.0.0.1:3101', root, app });
  } finally {
    app.kill('SIGTERM');
    if (app.exitCode === null && app.signalCode === null) await new Promise((resolve) => app.once('exit', resolve));
  }
}
