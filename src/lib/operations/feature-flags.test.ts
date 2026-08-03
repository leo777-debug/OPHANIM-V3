import { describe, expect, it } from 'vitest';
import { getFeatureFlags } from './feature-flags';

describe('edition feature flags', () => {
  it('selects only the logistics edition features by default', () => {
    const flags = getFeatureFlags({ OPHANIM_EDITION: 'logistics' });
    expect(flags.features.logistics).toBe(true);
    expect(flags.features.cyber).toBe(false);
  });

  it('allows explicit, declared feature overrides', () => {
    const flags = getFeatureFlags({ OPHANIM_EDITION: 'core', OPHANIM_FEATURE_FLAGS: 'cyber,-watchlists,unknown' });
    expect(flags.features.cyber).toBe(true);
    expect(flags.features.watchlists).toBe(false);
  });
});
