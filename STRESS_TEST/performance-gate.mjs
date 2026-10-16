import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const runs = [];
for (let index = 1; index <= 3; index++) {
  const result = spawnSync(process.execPath, ['STRESS_TEST/demo-readiness.mjs'], {
    cwd: root, env: process.env, windowsHide: true, stdio: ['ignore','pipe','pipe'], encoding:'utf8', timeout:180000,
  });
  const artifact = resolve(root,'STRESS_TEST/artifacts/demo-readiness.json');
  const report = JSON.parse(readFileSync(artifact,'utf8'));
  copyFileSync(artifact,resolve(root,`STRESS_TEST/artifacts/demo-readiness-run-${index}.json`));
  runs.push({ run:index, exitCode:result.status, checkedAt:report.checkedAt, timings:report.timings, failed:report.checks.filter(check=>!check.pass) });
  console.log(JSON.stringify(runs.at(-1)));
  if (result.error) throw result.error;
}
writeFileSync(resolve(root,'STRESS_TEST/artifacts/performance-gate.json'),JSON.stringify({ checkedAt:new Date().toISOString(),
  scope:'Three independent local server/database/browser launches, sequential, no competing test/build jobs. Process-cold first HTTP, OS filesystem cache not flushed. External traffic blocked. Not cloud/cold-machine certification.',
  runs },null,2));
if (runs.some(run=>run.exitCode!==0 || run.failed.length || run.timings.some(timing=>!timing.withinBudget))) process.exitCode=1;
