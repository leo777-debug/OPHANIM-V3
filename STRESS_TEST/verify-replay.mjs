import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';
await withIsolatedApp(async ({ base, root }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  for (const fixture of ['dubai-fog', 'earthquake']) {
    const response = await fetch(`${base}/api/verify/check`, { method: 'POST', headers: { Cookie: `ophanim_session=${demo.token}`, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ claim: { text: 'Demo claim' }, confirmed: true, fixture, useAi: false }) });
    const data = await response.json();
    console.log(JSON.stringify({ fixture, status: response.status, error: data.error, verdict: data.result?.verdict }));
    if (!response.ok) process.exitCode = 1;
  }
});
