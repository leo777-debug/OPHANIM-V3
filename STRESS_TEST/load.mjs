import autocannon from 'autocannon';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root, app }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const runs = [];
  for (const connections of [50, 200]) {
    const timings = [];
    const result = await new Promise((resolve, reject) => {
      const runner = autocannon({ url: base, connections, duration: 15, pipelining: 1,
        headers: { cookie: `ophanim_session=${demo.token}` },
        requests: [{ path: '/command' }, { path: '/atlas' }, { path: '/api/logistics/shipments' }],
      }, (error, result) => error ? reject(error) : resolve(result));
      runner.on('response', (_client, _status, _bytes, elapsed) => timings.push(elapsed));
    });
    timings.sort((a, b) => a - b);
    runs.push({ connections, durationSeconds: result.duration, responses: result.requests.total,
      p50Ms: timings[Math.floor(timings.length * 0.5)] ?? null, p95Ms: timings[Math.floor(timings.length * 0.95)] ?? null,
      errors: result.errors, timeouts: result.timeouts, non2xx: result.non2xx, statusCodes: result.statusCodeStats,
      serverPid: app.pid, database: demo.database,
    });
    console.log(JSON.stringify(runs.at(-1)));
  }
  await mkdir(resolve(root, 'STRESS_TEST/artifacts'), { recursive: true });
  await writeFile(resolve(root, 'STRESS_TEST/artifacts/load.json'), JSON.stringify({ checkedAt: new Date().toISOString(), externalTraffic: 'server fetch/socket/DNS blocked; no real providers', runs }, null, 2));
  if (runs.some((run) => run.errors || run.timeouts || run.non2xx)) process.exitCode = 1;
}, { native: process.argv.includes('--native'), databaseArgs: process.argv.includes('--large') ? ['--large'] : [] });
