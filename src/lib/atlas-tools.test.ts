import { describe, expect, it } from 'vitest';
import { ATLAS_TOOLS, atlasToolHref, parseAtlasTool } from './atlas-tools';
import { safeReturnPath } from './presentation/policy';

describe('Atlas tool destinations', () => {
  it.each(ATLAS_TOOLS)('opens $id through a validated internal destination', tool => {
    expect(parseAtlasTool(tool.id)).toBe(tool.id);
    expect(safeReturnPath(atlasToolHref(tool.id))).toBe(`/atlas?tool=${tool.id}&view=full`);
  });
  it.each([null, undefined, '', 'scan', 'https://evil.invalid', '../admin'])('ignores unknown tools: %s', tool => {
    expect(parseAtlasTool(tool)).toBeNull();
  });
});
