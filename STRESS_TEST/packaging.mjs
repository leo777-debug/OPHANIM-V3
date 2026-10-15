import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const checks = [];
  for (const [path, headers, expected] of [
    ['/api/health', {}, 200],
    ['/api/logistics/shipments', {}, 401],
    ['/api/logistics/shipments', { cookie: `ophanim_session=${demo.token}` }, 200],
    ['/verify', {}, 200],
    ['/atlas', {}, 200],
  ]) {
    const started = performance.now();
    try {
      const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(15000) });
      const body = await response.text();
      const validBody = path === '/verify' || path === '/atlas' ? body.includes('</html>')
        : path === '/api/logistics/shipments' && expected === 200 ? Array.isArray(JSON.parse(body).shipments) : true;
      checks.push({ path, authenticated: Boolean(headers.cookie), status: response.status, elapsedMs: Math.round(performance.now() - started), pass: response.status === expected && validBody });
    } catch (error) {
      checks.push({ path, authenticated: Boolean(headers.cookie), pass: false, error: error.name });
    }
  }
  await mkdir(resolve(root, 'STRESS_TEST/artifacts'), { recursive: true });
  await writeFile(resolve(root, 'STRESS_TEST/artifacts/packaging.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), package: 'fresh generated standalone server; no generated-file patch',
    externalTraffic: 'blocked by fetch, socket and DNS guards', checks,
  }, null, 2));
  console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failed: checks.filter((check) => !check.pass) }));
  if (checks.some((check) => !check.pass)) throw new Error('Standalone acceptance failed; see packaging.json.');
}, { standalone: true });
