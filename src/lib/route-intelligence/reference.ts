/** Public dataset metadata; safe to share with the browser without server imports. */
export const MARITIME_NETWORK = {
  id: 'marnet-reference', name: 'Marnet / searoute-py reference network',
  version: '1.6.0', datasetDate: '2026-05-17', importedAt: '2026-10-19',
  commit: 'dde461382a60ff75f4577f6e06c411bc48cd7efc',
  source: 'https://github.com/genthalili/searoute-py/tree/dde461382a60ff75f4577f6e06c411bc48cd7efc/searoute/data',
  licence: 'Apache-2.0', commercialUse: 'yes', keyNeeded: false,
  attribution: 'Marnet maritime reference network distributed by Gent Halili / searoute-py contributors, based on Eurostat searoute. Apache-2.0; original licence retained.',
  rateLimits: 'Packaged reference; no runtime upstream requests', refresh: 'Quarterly review; pinned dataset version',
  sha256: '111a82d949bb949c396a69a08828781314d3afe779c07e9754c3b2834dfca415',
  portsSha256: '8398cb9554a19cf37f53f932f3842f58fbd94fce4c8e2704c3f5a4205ea5977e',
  purpose: 'Schematic planning and distance estimates; not navigational routing. No draft, vessel class, currents, ice, opening hours or live passage status is modeled.',
};
