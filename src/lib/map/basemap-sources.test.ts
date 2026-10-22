import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LABEL_FONT, LABEL_FONT_BOLD, OPEN_FREE_MAP } from './basemap-sources';

// Fontstacks tiles.openfreemap.org serves (checked 2026-10-22); anything else returns 404.
const SERVED = new Set(['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic']);

describe('map label fonts', () => {
  it('uses single fontstacks the OpenFreeMap glyph server serves', () => {
    for (const stack of [LABEL_FONT, LABEL_FONT_BOLD, [OPEN_FREE_MAP.clusterFont]]) {
      expect(stack).toHaveLength(1);
      expect(SERVED.has(stack[0])).toBe(true);
    }
  });

  it('keeps OphanimMap labels on the shared fonts', () => {
    const source = readFileSync(path.join(process.cwd(), 'src', 'components', 'OphanimMap.tsx'), 'utf8');
    expect(source).not.toMatch(/'text-font':\s*\[/);
  });
});
