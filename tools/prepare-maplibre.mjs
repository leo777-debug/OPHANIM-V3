import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
const version = JSON.parse(await readFile(resolve(source, '../package.json'), 'utf8')).version;
if (version !== '6.14.0') throw new Error('Review the worker assets and loader before changing MapLibre versions.');
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../public/maplibre-build', version);
await mkdir(target, { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(resolve(source, name), resolve(target, name));
}
await copyFile(resolve(source, '../LICENSE.txt'), resolve(target, 'LICENSE.txt'));
console.log(`Prepared matching MapLibre ${version} worker assets with BSD-3-Clause attribution.`);
