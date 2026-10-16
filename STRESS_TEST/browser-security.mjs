import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withRunningSoakDatabase } from './with-soak-database.mjs';

await withRunningSoakDatabase(async ({ base, root }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addCookies([{ name: 'ophanim_session', value: demo.token, url: base, httpOnly: true, sameSite: 'Lax' }]);
  await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const checks = [];
  try {
    const reference = 'SYN-XSS <img src=x onerror="window.__ophanimSyntheticXss=1">';
    const created = await context.request.post(`${base}/api/logistics/shipments`, { headers: { Origin: base }, data: { shipmentReference: reference } });
    if (created.status() === 201) {
      const shipment = (await created.json()).shipment;
      const page = await context.newPage();
      await page.goto(`${base}/logistics/shipments/${shipment.id}`);
      await page.getByRole('heading', { name: reference, exact: true }).waitFor();
      const executed = await page.evaluate(() => window.__ophanimSyntheticXss === 1);
      checks.push({ check: 'stored shipment HTML is text, not executable markup', pass: !executed && await page.locator('img[src="x"]').count() === 0 });
    } else checks.push({ check: 'shipment rejects hostile markup before storage', status: created.status(), pass: created.status() === 400 });
    const injection = await context.request.get(`${base}/api/logistics/shipments?q=${encodeURIComponent("'; DROP TABLE ophanim_shipments;--")}`);
    const normal = await context.request.get(`${base}/api/logistics/shipments?limit=25`);
    checks.push({ check: 'SQL metacharacters remain parameter data', pass: injection.status() === 200 && normal.status() === 200 && (await normal.json()).shipments.length > 0 });
    const foreign = await context.request.post(`${base}/api/logistics/shipments`, { headers: { Origin: 'https://attacker.example' }, data: { shipmentReference: 'SYN-FORBIDDEN-ORIGIN' } });
    checks.push({ check: 'actual HTTP rejects foreign-origin authenticated mutation', status: foreign.status(), pass: [401, 403].includes(foreign.status()) });
    const own = await context.request.post(`${base}/api/logistics/shipments`, { headers: { Origin: base }, data: { shipmentReference: 'SYN-OWN-ORIGIN-CONTROL' } });
    checks.push({ check: 'actual HTTP same-origin positive mutation control', status: own.status(), pass: own.status() === 201 });
    await writeFile(resolve(root, 'STRESS_TEST/artifacts/browser-security.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.filter((item) => item.pass).length, failed: checks.filter((item) => !item.pass) }));
    if (checks.some((item) => !item.pass)) process.exitCode = 1;
  } finally { await context.close(); await browser.close(); }
});
