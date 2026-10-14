import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  let mode = 'invalid';
  const server = createServer((request, response) => {
    request.resume(); response.setHeader('Content-Type', 'application/json');
    if (mode === 'invalid') { response.end('synthetic-private-model-key'); return; }
    if (mode === 'empty') { response.end('{}'); return; }
    if (mode === 'failure') { response.writeHead(503); response.end('{}'); return; }
    if (mode === 'slow') { setTimeout(() => response.end(JSON.stringify({ choices: [{ message: { content: 'Synthetic summary after a short delay.' } }] })), 1200); return; }
    response.end(JSON.stringify({ choices: [{ message: { content: 'Synthetic summary.' } }] }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3155, '127.0.0.1', resolve); });
  const checks = [];
  try {
    for (mode of ['invalid', 'empty', 'failure', 'slow']) {
      const start = performance.now();
      const response = await fetch(`${base}/api/ai/generate`, { method: 'POST', headers: { Cookie: `ophanim_session=${demo.token}`, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'summarize', input: 'Synthetic advisory only', config: { baseUrl: 'http://127.0.0.1:3155/v1', model: 'synthetic-model', enabledTasks: ['summarize'] } }), signal: AbortSignal.timeout(15000) });
      const text = await response.text();
      checks.push({ mode, status: response.status, elapsedMs: Math.round(performance.now() - start), pass: response.status === (mode === 'slow' ? 200 : 502) && !text.includes('synthetic-private-model-key') });
      const shipments = await fetch(`${base}/api/logistics/shipments`, { headers: { Cookie: `ophanim_session=${demo.token}` } });
      checks.push({ mode, check: 'deterministic shipment API still works', status: shipments.status, pass: shipments.status === 200 });
    }
    await new Promise((resolve) => server.close(resolve));
    const unreachable = await fetch(`${base}/api/ai/generate`, { method: 'POST', headers: { Cookie: `ophanim_session=${demo.token}`, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'summarize', config: { baseUrl: 'http://127.0.0.1:3155/v1', model: 'synthetic-model', enabledTasks: ['summarize'] } }), signal: AbortSignal.timeout(15000) });
    checks.push({ mode: 'unreachable', status: unreachable.status, pass: unreachable.status === 502 });
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/ai-failure.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, scope: 'owned loopback mock; no live AI or paid provider; short-delay behavior, not a full 120-second timeout test' }, null, 2));
    console.log(JSON.stringify(checks)); if (checks.some((check) => !check.pass)) process.exitCode = 1;
  } finally { if (server.listening) await new Promise((resolve) => server.close(resolve)); }
});
