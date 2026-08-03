export interface SourceGovernanceRecord {
  provider: string;
  attribution: string;
  licensing: string;
  retentionHours: number;
  notes: string;
}

const DEFAULT_GOVERNANCE: Omit<SourceGovernanceRecord, 'provider'> = {
  attribution: 'Attribution is preserved in normalized results and linked evidence.',
  licensing: 'Review the upstream source terms before commercial use.',
  retentionHours: 24,
  notes: 'Operational data is cached only as needed for the provider response.',
};

const RECORDS: Record<string, Omit<SourceGovernanceRecord, 'provider'>> = {
  'war-sanctions': {
    attribution: 'War & Sanctions, Defence Intelligence of Ukraine.',
    licensing: 'Use subject to the source terms and applicable law.',
    retentionHours: 24,
    notes: 'Ophanim retains normalized catalogue data only for refresh and provenance.',
  },
  'maritime-ais': {
    attribution: 'Configured AIS and public maritime sources are shown with each result.',
    licensing: 'Live position data remains subject to each upstream provider terms.',
    retentionHours: 1,
    notes: 'Current positions are ephemeral; historical tracks require explicit storage policy.',
  },
  voidaccess: {
    attribution: 'VoidAccess results are attributed to the configured private service.',
    licensing: 'Only use sources and collection methods authorized for the deployment.',
    retentionHours: 24,
    notes: 'No provider URL or credentials are exposed to the browser.',
  },
};

export function sourceGovernance(provider: string): SourceGovernanceRecord {
  return { provider, ...(RECORDS[provider] ?? DEFAULT_GOVERNANCE) };
}
