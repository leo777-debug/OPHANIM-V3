import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';
import { chromium } from '@playwright/test';

await withIsolatedApp(async ({ base, root }) => {
  const checks = [];
  const credentials = { email: 'presenter@example.test', password: 'Synthetic-Demo-Only-2026', organizationSlug: 'competition-demo' };
  const signIn = (body, headers = {}) => fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const check = async (name, run) => {
    try { await run(); checks.push({ name, pass: true }); }
    catch { checks.push({ name, pass: false }); }
  };

  await check('own-origin valid login creates a usable protected session with secure cookies', async () => {
    const response = await signIn(credentials, { origin: base });
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((cookie) => /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie)));
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const own = await fetch(`${base}/api/logistics/shipments`, { headers: { cookie }, signal: AbortSignal.timeout(15000) });
    assert.equal(own.status, 200);
    assert.ok(Array.isArray((await own.json()).shipments));
  });
  await check('foreign origin rejected even with valid demo credentials and no cookies issued', async () => {
    const response = await signIn(credentials, { origin: 'https://foreign.example.test' });
    assert.equal(response.status, 403);
    assert.equal(response.headers.getSetCookie().length, 0);
  });
  await check('cross-site browser context rejected without Origin too', async () => {
    assert.equal((await signIn(credentials, { 'sec-fetch-site': 'cross-site' })).status, 403);
  });
  await check('null JSON rejected without runtime error', async () => {
    assert.equal((await signIn('null')).status, 400);
  });
  await check('oversized actual body rejected', async () => {
    assert.equal((await signIn({ ...credentials, password: 'x'.repeat(9000) })).status, 413);
  });
  await check('rotating IP headers, email case and organization slugs cannot reset account budget', async () => {
    for (let i = 0; i < 11; i++) {
      const response = await signIn({
        email: i % 2 ? '  Budget-Check@Example.Test ' : 'budget-check@example.test',
        password: 'Synthetic-Incorrect-Password', organizationSlug: `synthetic-org-${i}`,
      }, { 'x-forwarded-for': `198.51.100.${i + 1}` });
      assert.equal(response.status, i < 10 ? 401 : 429);
      if (i === 10) assert.equal(response.headers.get('retry-after'), '60');
    }
  });
  await check('Chromium form sign-in reaches the protected app with its real browser session', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', () => errors.push('page-error'));
      await page.goto(`${base}/login`);
      await page.getByLabel('Organization slug', { exact: true }).fill(credentials.organizationSlug);
      await page.getByLabel('Work email', { exact: true }).fill(credentials.email);
      await page.getByLabel('Password', { exact: true }).fill(credentials.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL((url) => url.pathname !== '/login');
      assert.equal((await context.request.get(`${base}/api/logistics/shipments`)).status(), 200);
      assert.equal(errors.length, 0);
      await context.close();
    } finally { await browser.close(); }
  });
  await writeFile(resolve(root, 'STRESS_TEST/artifacts/login-security.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), scope: 'owned isolated application/database; synthetic demo only; no external Auth service',
    limitations: 'Per-process budget, not a distributed quota or live Supabase session certification.', checks,
  }, null, 2));
  console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failed: checks.filter((check) => !check.pass).map((check) => check.name) }));
  if (checks.some((check) => !check.pass)) throw new Error('Login boundary regression; inspect login-security.json.');
});
