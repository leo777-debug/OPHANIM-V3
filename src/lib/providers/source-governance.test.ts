import { describe, expect, it } from 'vitest';
import { getProductionSourceCatalog, sourceGovernance } from './source-governance';

describe('production source governance', () => {
  it('keeps operational sources distinct from visual-only extras', () => {
    const catalog = getProductionSourceCatalog();
    expect(catalog.find((source) => source.id === 'aisstream')).toMatchObject({ mode: 'core', scope: ['logistics'] });
    expect(catalog.find((source) => source.id === 'cisa-kev')).toMatchObject({ mode: 'core', scope: ['cybersecurity'] });
    expect(catalog.find((source) => source.id === 'map-visual-extras')).toMatchObject({ mode: 'disabled_by_default', enabledByDefault: false });
  });

  it('does not expose configuration values in the catalog', () => {
    const source = getProductionSourceCatalog().find((item) => item.id === 'voidaccess');
    expect(source).toMatchObject({ configuration: 'VOIDACCESS_API_URL' });
    expect(Object.values(source ?? {})).not.toContain(process.env.VOIDACCESS_API_URL);
  });

  it('retains provider-specific governance details', () => {
    expect(sourceGovernance('war-sanctions')).toMatchObject({ retentionHours: 24 });
  });
});
