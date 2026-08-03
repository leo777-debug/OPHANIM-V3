export const OPHANIM_FEATURES = [
  'global_map',
  'provider_registry',
  'watchlists',
  'logistics',
  'cyber',
  'dark_web',
  'sandbox_research',
] as const;

export type OphanimFeature = (typeof OPHANIM_FEATURES)[number];
export type OphanimEdition = 'core' | 'logistics' | 'cyber' | 'maritime' | 'full';

const EDITION_FEATURES: Record<OphanimEdition, OphanimFeature[]> = {
  core: ['global_map', 'provider_registry', 'watchlists'],
  logistics: ['global_map', 'provider_registry', 'watchlists', 'logistics'],
  cyber: ['global_map', 'provider_registry', 'watchlists', 'cyber'],
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

export function getFeatureFlags(environment = process.env): { edition: OphanimEdition; features: Record<OphanimFeature, boolean> } {
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

export function isFeatureEnabled(feature: OphanimFeature, environment = process.env): boolean {
  return getFeatureFlags(environment).features[feature];
}
