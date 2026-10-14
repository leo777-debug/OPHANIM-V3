import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { startTestApp } from './start-test.mjs';

const root = resolve(import.meta.dirname, '..');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES|PROGRAMFILES\(X86\)|NUMBER_OF_PROCESSORS)$/i.test(key)));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function vacant(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Owned test port ${port} is occupied; refusing to contact an unknown service.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
async function ready(child, marker) {
  await new Promise((resolve, reject) => {
    let output = '';
    const finish = (error) => {
      clearTimeout(timer); child.stdout.off('data', read); child.off('exit', exited);
      if (error) reject(error); else resolve();
    };
    const read = (chunk) => { output = (output + chunk.toString()).slice(-16384); if (output.includes(marker)) finish(); };
    const exited = () => finish(new Error('Owned isolated service exited before readiness.'));
    const timer = setTimeout(() => finish(new Error('Owned isolated service startup timed out.')), 120000);
    child.stdout.on('data', read); child.once('exit', exited);
  });
}
export async function withIsolatedApp(run, options = {}) {
  await vacant(3100); await vacant(55432);
  const children = [];
  try {
    const database = spawn(process.execPath, ['STRESS_TEST/local-db.mjs', ...(options.databaseArgs ?? [])], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    children.push(database); database.stderr.on('data', () => {});
    await ready(database, 'Disposable PostgreSQL socket verified');
    const app = startTestApp(['ignore', 'pipe', 'pipe'], options.standalone ?? false);
    children.push(app); app.stderr.on('data', () => {});
    await ready(app, 'Ready in');
    return await run({ base: 'http://127.0.0.1:3100', root, app });
  } finally {
    for (const child of children.reverse()) child.kill('SIGTERM');
    for (let i = 0; i < 50 && children.some((child) => child.exitCode === null && child.signalCode === null); i++) await pause(100);
    if (children.some((child) => child.exitCode === null && child.signalCode === null)) throw new Error('Owned test child did not terminate; inspect it before resuming.');
  }
}
