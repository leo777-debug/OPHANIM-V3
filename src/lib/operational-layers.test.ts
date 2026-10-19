import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPERATIONAL_LAYERS } from './operational-layers';

describe('independent logistics map', () => {
  it('uses native source-attributed controls with no third-party product iframe', () => {
    const workspace = readFileSync('src/components/logistics/LogisticsMapWorkspace.tsx', 'utf8');
    expect(workspace).toContain('<OphanimMap');
    expect(workspace).not.toMatch(/worldmonitor\.app|<iframe|WorldMonitor API/);
    expect(OPERATIONAL_LAYERS.every(item => item.ophanimKey && item.source)).toBe(true);
  });
});
