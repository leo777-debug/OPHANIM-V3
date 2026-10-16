import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const loader = require('../../tools/maplibre-worker-loader.cjs') as (source: string) => string;
describe('patched MapLibre worker integration', () => {
  it('only changes the dynamic worker URL base and fails closed on a changed dependency', () => {
    const source = readFileSync(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'), 'utf8');
    const result = loader(source);
    expect(result).not.toContain('new URL(e,import.meta.url).href');
    expect(result.replace('new URL(e,globalThis.location.href).href', 'new URL(e,import.meta.url).href')).toBe(source);
    expect(() => loader('unexpected library')).toThrow('needs review');
  });
  it('uses the exact pinned worker version and preserves its license', () => {
    const component = readFileSync('src/components/OphanimMap.tsx', 'utf8');
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(manifest.dependencies['maplibre-gl']).toBe('6.14.0');
    expect(component).toContain('/maplibre-build/6.14.0/maplibre-gl-worker.mjs');
    expect(readFileSync('tools/prepare-maplibre.mjs', 'utf8')).toContain('LICENSE.txt');
  });
});
