import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { withRunningSoakDatabase } from './with-soak-database.mjs';

await (process.argv.includes('--reuse-owned-soak') ? withRunningSoakDatabase : withIsolatedApp)(async ({ base, root }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  await mkdir(resolve(root, 'STRESS_TEST/artifacts/browser'), { recursive: true });
  const checks = [];
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    let browser;
    try {
      const repairedFirefox = resolve(root, 'STRESS_TEST/runtime/browsers/firefox-1555/firefox/firefox.exe');
      browser = await engine.launch({ headless: true, ...(name === 'firefox' && existsSync(repairedFirefox) ? { executablePath: repairedFirefox } : {}) });
      for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1920, height: 1080 }]) {
        const context = await browser.newContext({ viewport });
        await context.addCookies([{ name: 'ophanim_session', value: demo.token, url: base, httpOnly: true, sameSite: 'Lax' }]);
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.origin === base || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
          return route.abort();
        });
        const page = await context.newPage();
        for (const path of ['/verify', '/imports', '/logistics/command', '/atlas']) {
          const errors = [];
          const listener = (error) => errors.push(error.message.slice(0, 200));
          page.on('pageerror', listener);
          const start = performance.now();
          try {
            await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.locator('main,canvas').first().waitFor({ timeout: 15000 });
            await page.waitForTimeout(1800);
            let mapPixels;
            if (path === '/atlas') {
              await page.getByTestId('offline-basemap').waitFor({ timeout: 15000 });
              await page.waitForTimeout(3500);
              const surface = page.locator('canvas.maplibregl-canvas').first();
              const before = await surface.screenshot();
              const { data, info } = await sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true });
              let land = 0, ocean = 0;
              for (let i = 0; i < data.length; i += info.channels) {
                if (Math.abs(data[i] - 51) < 15 && Math.abs(data[i + 1] - 67) < 15 && Math.abs(data[i + 2] - 62) < 15) land++;
                if (Math.abs(data[i] - 28) < 15 && Math.abs(data[i + 1] - 43) < 15 && Math.abs(data[i + 2] - 53) < 15) ocean++;
              }
              const box = await surface.boundingBox();
              await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
              await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.60, { steps: 12 }); await page.mouse.up();
              await page.waitForTimeout(800);
              const after = await surface.screenshot();
              mapPixels = { land, ocean, changedAfterDrag: createHash('sha256').update(before).digest('hex') !== createHash('sha256').update(after).digest('hex') };
            }
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            const canvas = await page.locator('canvas').count();
            await page.screenshot({ path: resolve(root, `STRESS_TEST/artifacts/browser/${name}-${viewport.width}-${path.replaceAll('/', '')}.png`), fullPage: true });
            checks.push({ browser: name, width: viewport.width, path, elapsedMs: Math.round(performance.now() - start), errors, overflow, canvasElements: canvas, mapPixels, pass: !errors.length && !overflow && (!mapPixels || (mapPixels.land > 100 && mapPixels.ocean > 100 && mapPixels.changedAfterDrag)), mapAssets: path === '/atlas' ? 'Bundled Natural Earth fallback; external tiles blocked; screenshot pixels and drag verified' : undefined });
          } catch (error) { checks.push({ browser: name, width: viewport.width, path, pass: false, reason: error.message.slice(0, 300) }); }
          page.off('pageerror', listener);
        }
        await page.goto(`${base}/verify`);
        await page.getByText('Loading history...', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
        await context.setOffline(true);
        await page.getByLabel('Claim', { exact: true }).fill('Earthquake in Tokyo');
        await page.getByRole('button', { name: 'Review claim', exact: true }).click();
        await page.locator('p[role="alert"]').waitFor({ timeout: 10000 });
        await context.setOffline(false);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByText('Loading history...', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
        await page.getByRole('button', { name: 'Tokyo earthquake', exact: true }).click();
        await page.getByRole('article', { name: 'Verification result' }).waitFor({ timeout: 10000 });
        checks.push({ browser: name, width: viewport.width, path: 'Verify offline failure and replay recovery', pass: true });
        await context.close();
      }
    } catch (error) { checks.push({ browser: name, pass: false, reason: error.message.slice(0, 400) }); }
    finally { await browser?.close(); }
  }
  await writeFile(resolve(root, 'STRESS_TEST/artifacts/browser-matrix.json'), JSON.stringify({ checkedAt: new Date().toISOString(), runtime: process.argv.includes('--standalone') ? 'generated standalone package' : 'production CLI', checks }, null, 2));
  console.log(JSON.stringify({ passed: checks.filter((check) => check.pass).length, failed: checks.filter((check) => !check.pass) }));
  if (checks.some((check) => !check.pass)) process.exitCode = 1;
}, { standalone: process.argv.includes('--standalone') });
