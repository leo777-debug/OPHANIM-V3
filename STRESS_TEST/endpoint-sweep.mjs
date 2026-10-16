import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { endpointPolicies } from './endpoint-policy.mjs';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const checks = [];
  for (const endpoint of endpointPolicies(root)) {
    const path = endpoint.path.replace(/\[[^\]]+\]/g, '11111111-1111-4111-8111-111111111111');
    const started = performance.now();
    try {
      const response = await fetch(base + path, { method: endpoint.method, signal: AbortSignal.timeout(45000), redirect: 'manual',
        headers: { origin: base, 'content-type': 'application/json', authorization: 'Bearer deliberately-invalid-test-key' },
        ...(['GET','HEAD','OPTIONS'].includes(endpoint.method) ? {} : { body: '{}' }),
      });
      const text = await response.text();
      const requiresGate = ['member','cron-secret','service-key','webhook-signature'].includes(endpoint.policy);
      const denied = ['member','cron-secret'].includes(endpoint.policy) ? [401,403] : [401,403,503];
      const pass = requiresGate ? denied.includes(response.status) && !text.includes('stack') : response.status !== 405 && response.status !== 404;
      // Missing public records/coordinates legitimately return 404; availability
      // failures are recorded separately, not counted as a successful live feed.
      const missingPublicInput = response.status === 404 && ['public-input','anonymous-owner-or-member','public-provider'].includes(endpoint.policy);
      checks.push({ ...endpoint, status: response.status, elapsedMs: Math.round(performance.now()-started), pass: pass || missingPublicInput,
        availability: response.status >= 500 ? 'unavailable-with-isolated-providers' : 'responded' });
    } catch (error) {
      checks.push({ ...endpoint, pass: false, elapsedMs: Math.round(performance.now()-started), error: error.name });
    }
  }
  await writeFile(resolve(root,'STRESS_TEST/artifacts/endpoint-sweep.json'),JSON.stringify({ checkedAt:new Date().toISOString(),
    scope:'Every exported API handler: anonymous/wrong-key runtime boundary. Not every permitted payload or cross-tenant permutation. All external traffic blocked.', checks },null,2));
  console.log(JSON.stringify({ total:checks.length, passed:checks.filter(check=>check.pass).length, failed:checks.filter(check=>!check.pass), unavailable:checks.filter(check=>check.availability==='unavailable-with-isolated-providers').map(check=>check.path) }));
  if (checks.some(check=>!check.pass)) process.exitCode=1;
});
