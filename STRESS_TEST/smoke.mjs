import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { startTestApp } from './start-test.mjs';

const root = resolve(import.meta.dirname, '..');
const base = 'http://127.0.0.1:3100';
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES|PROGRAMFILES\(X86\)|NUMBER_OF_PROCESSORS)$/i.test(key)));
const children = [];
let browser;
let stage = 'startup';
const observations = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function start(script) {
  const child = spawn(process.execPath, [script], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  // Runtime logs stay local; the launcher refuses real environment files/keys.
  child.stderr.on('data', () => {});
  return child;
}
async function ready(child, text) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated service startup timed out.')), 120000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes(text)) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Isolated service exited before becoming ready.')); });
  });
}
try {
  try { await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) }); throw new Error('Test port 3100 is occupied; refusing to test an unknown server.'); }
  catch (error) { if (error.message.includes('occupied')) throw error; }
  await ready(start('STRESS_TEST/local-db.mjs'), 'Disposable PostgreSQL socket verified');
  stage = 'start app';
  const app = startTestApp(['ignore', 'pipe', 'pipe']);
  children.push(app);
  app.stderr.on('data', (chunk) => console.error(`Isolated app: ${chunk.toString().slice(0, 1000)}`));
  await ready(app, 'Ready in');
  stage = 'health request';
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10000) });
  if (health.status !== 200) throw new Error('Health smoke failed.');
  stage = 'anonymous shipment request';
  const denied = await fetch(`${base}/api/logistics/shipments`, { signal: AbortSignal.timeout(10000) });
  if (denied.status !== 401) throw new Error('Anonymous shipment access was not rejected.');
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  stage = 'authenticated shipment request';
  const shipments = await fetch(`${base}/api/logistics/shipments`, {
    headers: { cookie: `ophanim_session=${demo.token}` }, signal: AbortSignal.timeout(10000),
  });
  if (shipments.status !== 200 || !Array.isArray((await shipments.json()).shipments)) throw new Error('Demo authenticated shipment API failed.');
  observations.push({ check: 'health, anonymous 401, authenticated demo shipment response', status: 'pass' });
  await mkdir(resolve(root, 'STRESS_TEST/artifacts'), { recursive: true });
  browser = await chromium.launch({ headless: true });
  stage = 'Verify browser checks';
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    let blocked = 0;
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' && url.port === '3100') return route.continue();
      if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
      blocked++; return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)));
    await page.goto(`${base}/verify`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Is this true?' }).waitFor({ timeout: 15000 });
    await page.getByText('Loading history...').waitFor({ state: 'hidden', timeout: 10000 });
    await page.screenshot({ path: resolve(root, `STRESS_TEST/artifacts/verify-${viewport.width}.png`), fullPage: true });
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    observations.push({ check: `Verify ${viewport.width}px`, status: errors.length || horizontalOverflow ? 'fail' : 'pass', errors, externalRequestsBlocked: blocked, horizontalOverflow });
    await context.close();
  }
  await writeFile(resolve(root, 'STRESS_TEST/artifacts/smoke.json'), JSON.stringify({ checkedAt: new Date().toISOString(), database: 'embedded PostgreSQL; not native concurrency', observations }, null, 2));
  console.log(JSON.stringify(observations));
  if (observations.some((item) => item.status !== 'pass')) throw new Error('Browser smoke found a runtime or layout failure.');
} catch (error) {
  console.error(`${stage}: ${error instanceof Error ? error.message : 'Isolated smoke failed.'}`); process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of children.reverse()) child.kill('SIGTERM');
  for (let n = 0; n < 20 && children.some((child) => child.exitCode === null && child.signalCode === null); n++) await pause(100);
}
