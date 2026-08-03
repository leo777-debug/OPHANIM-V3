export const OPHANIM_FEATURES = [
  'global_map',
  'provider_registry',
  'watchlists',
  'imports',
  'logistics',
  'cyber',
  'dark_web',
  'sandbox_research',
] as const;

export type OphanimFeature = (typeof OPHANIM_FEATURES)[number];
export type OphanimEdition = 'core' | 'logistics' | 'cyber' | 'maritime' | 'full';
export interface FeatureFlagEnvironment {
  OPHANIM_EDITION?: string;
  OPHANIM_FEATURE_FLAGS?: string;
}

const runtimeFeatureFlagEnvironment: FeatureFlagEnvironment = {
  OPHANIM_EDITION: process.env.OPHANIM_EDITION,
  OPHANIM_FEATURE_FLAGS: process.env.OPHANIM_FEATURE_FLAGS,
};

const EDITION_FEATURES: Record<OphanimEdition, OphanimFeature[]> = {
  core: ['global_map', 'provider_registry', 'watchlists'],
  logistics: ['global_map', 'provider_registry', 'watchlists', 'imports', 'logistics'],
  cyber: ['global_map', 'provider_registry', 'watchlists', 'imports', 'cyber'],
  maritime: ['global_map', 'provider_registry', 'watchlists', 'dark_web'],
  full: [...OPHANIM_FEATURES],
};

function edition(value: string | undefined): OphanimEdition {
  return value === 'core' || value === 'logistics' || value === 'cyber' || value === 'maritime' || value === 'full' ? value : 'full';
}

function overrides(value: string | undefined): Map<OphanimFeature, boolean> {
  const result = new Map<OphanimFeature, boolean>();
  for (const raw of (value ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const enabled = !raw.startsWith('-');
    const feature = raw.replace(/^-/, '') as OphanimFeature;
    if (OPHANIM_FEATURES.includes(feature)) result.set(feature, enabled);
  }
  return result;
}

export function getFeatureFlags(environment: FeatureFlagEnvironment = runtimeFeatureFlagEnvironment): { edition: OphanimEdition; features: Record<OphanimFeature, boolean> } {
  const selectedEdition = edition(environment.OPHANIM_EDITION);
  const enabled = new Set(EDITION_FEATURES[selectedEdition]);
  for (const [feature, value] of overrides(environment.OPHANIM_FEATURE_FLAGS)) {
    if (value) enabled.add(feature);
    else enabled.delete(feature);
  }
  return {
    edition: selectedEdition,
    features: Object.fromEntries(OPHANIM_FEATURES.map((feature) => [feature, enabled.has(feature)])) as Record<OphanimFeature, boolean>,
  };
}

export function isFeatureEnabled(feature: OphanimFeature, environment: FeatureFlagEnvironment = runtimeFeatureFlagEnvironment): boolean {
  return getFeatureFlags(environment).features[feature];
}
