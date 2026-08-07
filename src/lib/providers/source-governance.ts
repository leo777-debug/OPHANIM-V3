export interface SourceGovernanceRecord {
  provider: string;
  attribution: string;
  licensing: string;
  retentionHours: number;
  notes: string;
}

export type ProductionSourceMode = 'core' | 'supporting' | 'optional' | 'disabled_by_default';
export type EvidenceTier = 'primary_authority' | 'direct_operator' | 'original_source' | 'trusted_news' | 'osint' | 'unverified';

export interface ProductionSourceRecord {
  id: string;
  name: string;
  scope: Array<'logistics' | 'cybersecurity'>;
  mode: ProductionSourceMode;
  evidenceTier: EvidenceTier;
  refresh: string;
  configuration?: string;
  attribution: string;
  licensing: string;
  purpose: string;
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

const PRODUCTION_SOURCES: ProductionSourceRecord[] = [
  {
    id: 'gdacs', name: 'GDACS', scope: ['logistics', 'cybersecurity'], mode: 'core', evidenceTier: 'primary_authority', refresh: '5 minutes',
    attribution: 'Global Disaster Alert and Coordination System.', licensing: 'Review GDACS terms before commercial redistribution.',
    purpose: 'Detect major disasters that can affect routes, facilities, or regional operations.',
  },
  {
    id: 'usgs-earthquakes', name: 'USGS Earthquake Hazards', scope: ['logistics', 'cybersecurity'], mode: 'core', evidenceTier: 'primary_authority', refresh: '15 minutes',
    attribution: 'U.S. Geological Survey.', licensing: 'Use subject to USGS data-use guidance.',
    purpose: 'Correlate seismic events with route, port, facility, and outage exposure.',
  },
  {
    id: 'nasa-firms-eonet', name: 'NASA FIRMS and EONET', scope: ['logistics', 'cybersecurity'], mode: 'core', evidenceTier: 'primary_authority', refresh: '10 minutes',
    attribution: 'NASA FIRMS and Earth Observatory Natural Event Tracker.', licensing: 'Use subject to NASA data-use guidance.',
    purpose: 'Identify active fires, volcanoes, and major natural events near operational assets.',
  },
  {
    id: 'ecmwf-forecast', name: 'ECMWF forecast adapter', scope: ['logistics', 'cybersecurity'], mode: 'core', evidenceTier: 'primary_authority', refresh: 'Configuration-defined', configuration: 'ECMWF_FORECAST_URL',
    attribution: 'Configured ECMWF Open Data or licensed forecast endpoint.', licensing: 'Validate the selected ECMWF dataset and redistribution terms before production use.',
    purpose: 'Assess wind, flood, storm-surge, and dangerous-sea conditions near customer routes.',
  },
  {
    id: 'aisstream', name: 'AISStream', scope: ['logistics'], mode: 'core', evidenceTier: 'direct_operator', refresh: 'Streaming', configuration: 'AIS_API_KEY',
    attribution: 'AISStream.', licensing: 'Use according to the configured AISStream plan and terms.',
    purpose: 'Track customer-relevant vessel movement and derive conservative operational signals.',
  },
  {
    id: 'digitraffic-marine', name: 'Digitraffic Marine AIS', scope: ['logistics'], mode: 'core', evidenceTier: 'primary_authority', refresh: '45 seconds',
    attribution: 'Finnish Transport Infrastructure Agency, Digitraffic.', licensing: 'Use subject to Digitraffic terms.',
    purpose: 'Provide structured regional AIS positions and harbour context.',
  },
  {
    id: 'customer-ais', name: 'Customer AIS provider', scope: ['logistics'], mode: 'core', evidenceTier: 'direct_operator', refresh: '60 seconds', configuration: 'CUSTOMER_AIS_API_URL',
    attribution: 'Customer-configured AIS provider.', licensing: 'Customer must be authorized to supply and share the data.',
    purpose: 'Add the licensed coverage required for customer vessels and routes.',
  },
  {
    id: 'official-sanctions', name: 'Official sanctions feeds', scope: ['logistics', 'cybersecurity'], mode: 'core', evidenceTier: 'primary_authority', refresh: 'Daily', configuration: 'OFFICIAL_SANCTIONS_FEED_URL',
    attribution: 'OFAC, UK Sanctions List, EU consolidated sanctions data, and UN Security Council.', licensing: 'Compliance teams must validate list use and screening obligations.',
    purpose: 'Match sanctioned entities, vessels, owners, and operators to operational records.',
  },
  {
    id: 'war-sanctions', name: 'War and Sanctions', scope: ['logistics'], mode: 'supporting', evidenceTier: 'original_source', refresh: '15 minutes',
    attribution: 'War and Sanctions, Defence Intelligence of Ukraine.', licensing: 'Use subject to source terms and applicable law.',
    purpose: 'Enrich official sanctions screening with shadow-fleet and vessel context.',
  },
  {
    id: 'ioda', name: 'IODA outage intelligence', scope: ['logistics', 'cybersecurity'], mode: 'core', evidenceTier: 'original_source', refresh: 'Configuration-defined', configuration: 'IODA_API_URL',
    attribution: 'Internet Outage Detection and Analysis, Georgia Tech.', licensing: 'Review API availability and commercial-use terms before enabling.',
    purpose: 'Correlate regional connectivity loss with port, customs, carrier, and customer disruption.',
  },
  {
    id: 'ripe-ris-live', name: 'RIPE RIS Live', scope: ['logistics', 'cybersecurity'], mode: 'core', evidenceTier: 'original_source', refresh: 'Streaming', configuration: 'RIPE_RIS_FILTERS',
    attribution: 'RIPE NCC RIS Live.', licensing: 'Use subject to RIPE NCC terms and service limits.',
    purpose: 'Investigate BGP announcements, withdrawals, route leaks, and outage correlation.',
  },
  {
    id: 'cisa-kev', name: 'CISA KEV', scope: ['cybersecurity'], mode: 'core', evidenceTier: 'primary_authority', refresh: '30 minutes',
    attribution: 'U.S. Cybersecurity and Infrastructure Security Agency.', licensing: 'Public data; retain source attribution.',
    purpose: 'Prioritize vulnerabilities with confirmed exploitation for customer exposure assessment.',
  },
  {
    id: 'nvd', name: 'NIST NVD', scope: ['cybersecurity'], mode: 'core', evidenceTier: 'primary_authority', refresh: '30 minutes',
    attribution: 'National Vulnerability Database, NIST.', licensing: 'Use subject to NVD API rate limits and data-use terms.',
    purpose: 'Provide authoritative CVE metadata, severity, affected products, and references.',
  },
  {
    id: 'epss', name: 'FIRST EPSS', scope: ['cybersecurity'], mode: 'core', evidenceTier: 'original_source', refresh: '30 minutes',
    attribution: 'FIRST Exploit Prediction Scoring System.', licensing: 'Use subject to FIRST data terms.',
    purpose: 'Add exploitation-likelihood context to vulnerability prioritization.',
  },
  {
    id: 'osv', name: 'OSV.dev', scope: ['cybersecurity'], mode: 'core', evidenceTier: 'original_source', refresh: '30 minutes',
    attribution: 'Open Source Vulnerabilities database.', licensing: 'Use subject to OSV.dev terms.',
    purpose: 'Provide package and fixed-version context for software exposure checks.',
  },
  {
    id: 'urlhaus', name: 'abuse.ch URLhaus', scope: ['cybersecurity'], mode: 'core', evidenceTier: 'original_source', refresh: '10 minutes',
    attribution: 'abuse.ch URLhaus.', licensing: 'Use subject to abuse.ch terms.',
    purpose: 'Track malware-delivery infrastructure relevant to customer assets.',
  },
  {
    id: 'threatfox', name: 'abuse.ch ThreatFox', scope: ['cybersecurity'], mode: 'core', evidenceTier: 'original_source', refresh: '10 minutes', configuration: 'THREATFOX_AUTH_KEY',
    attribution: 'abuse.ch ThreatFox.', licensing: 'Requires an approved access key and compliance with abuse.ch terms.',
    purpose: 'Add malware-related indicators with explicit source provenance.',
  },
  {
    id: 'reviewed-news', name: 'Reviewed news and OSINT', scope: ['logistics', 'cybersecurity'], mode: 'supporting', evidenceTier: 'osint', refresh: '30 minutes',
    attribution: 'Reviewed source registry maintained by Ophanim operators.', licensing: 'Respect each publisher and platform terms.',
    purpose: 'Discover potential incidents; never establish a shipment or exposure decision on its own.',
  },
  {
    id: 'voidaccess', name: 'VoidAccess research worker', scope: ['cybersecurity'], mode: 'optional', evidenceTier: 'unverified', refresh: 'Scheduled or on-demand', configuration: 'VOIDACCESS_API_URL',
    attribution: 'Configured private VoidAccess service.', licensing: 'Use only in an isolated, authorized defensive-research deployment.',
    purpose: 'Investigate approved customer, vendor, and domain mentions with analyst verification.',
  },
  {
    id: 'aviation-adsb', name: 'Aviation ADS-B sources', scope: ['logistics'], mode: 'supporting', evidenceTier: 'original_source', refresh: '5 minutes',
    attribution: 'Configured public ADS-B receivers and compatible aviation sources.', licensing: 'Confirm upstream service terms and redistribution rights before commercial use.',
    purpose: 'Provide aircraft activity context around routes, hubs, and incidents.',
  },
  {
    id: 'submarine-cables', name: 'Submarine cable reference layer', scope: ['logistics', 'cybersecurity'], mode: 'supporting', evidenceTier: 'original_source', refresh: 'Packaged reference data',
    attribution: 'Ophanim packaged cable reference dataset with retained provenance.', licensing: 'Review source attribution and update cadence before commercial redistribution.',
    purpose: 'Provide cable-route context for maritime, outage, and infrastructure investigations.',
  },
  {
    id: 'markets-space-weather', name: 'Markets and space weather', scope: ['logistics', 'cybersecurity'], mode: 'supporting', evidenceTier: 'original_source', refresh: '30 minutes',
    attribution: 'Configured market data providers and NOAA space-weather data.', licensing: 'Respect each financial-data provider license and rate limit.',
    purpose: 'Provide operational market context and solar-weather conditions alongside primary evidence.',
  },
  {
    id: 'marinetraffic-ais', name: 'MarineTraffic AIS API', scope: ['logistics'], mode: 'optional', evidenceTier: 'direct_operator', refresh: '60 seconds', configuration: 'MARINETRAFFIC_AIS_API_URL, MARINETRAFFIC_API_KEY',
    attribution: 'MarineTraffic AIS API, Kpler.', licensing: 'Requires an active MarineTraffic API service; browser map tiles are not an approved ingestion method.',
    purpose: 'Add licensed vessel coverage through the official MarineTraffic API when configured.',
  },
  {
    id: 'public-logistics-cameras', name: 'Public logistics camera context', scope: ['logistics', 'cybersecurity'], mode: 'supporting', evidenceTier: 'direct_operator', refresh: '5 seconds to 5 minutes',
    attribution: 'Each camera retains its public road, transport, or operator source attribution.', licensing: 'Use only source-published public feeds approved for the deployment; do not archive, scrape around access controls, or treat imagery as security surveillance.',
    purpose: 'Provide public transport context around ports, airports, border corridors, freight routes, and canals without exposing sensitive facilities.',
  },
  {
    id: 'map-visual-extras', name: 'Visual-only map sources', scope: ['logistics', 'cybersecurity'], mode: 'disabled_by_default', evidenceTier: 'unverified', refresh: 'On demand',
    attribution: 'Optional cameras, satellites, broadcast video, and SDK demo layers.', licensing: 'Each source needs its own approved commercial-use review.',
    purpose: 'Available only when relevant to a specific customer workflow or investigation.',
  },
];

const CONFIGURATION_VARIABLES: Record<string, string | string[]> = {
  'ecmwf-forecast': 'ECMWF_FORECAST_URL',
  aisstream: 'AIS_API_KEY',
  'customer-ais': 'CUSTOMER_AIS_API_URL',
  'marinetraffic-ais': ['MARINETRAFFIC_AIS_API_URL', 'MARINETRAFFIC_API_KEY'],
  'official-sanctions': 'OFFICIAL_SANCTIONS_FEED_URL',
  ioda: 'IODA_API_URL',
  'ripe-ris-live': 'RIPE_RIS_FILTERS',
  threatfox: 'THREATFOX_AUTH_KEY',
  voidaccess: 'VOIDACCESS_API_URL',
};

function isSourceConfigured(sourceId: string): boolean {
  const requirement = CONFIGURATION_VARIABLES[sourceId];
  if (!requirement) return true;
  const variables = Array.isArray(requirement) ? requirement : [requirement];
  return variables.every((name) => Boolean(process.env[name]));
}

export function getProductionSourceCatalog() {
  return PRODUCTION_SOURCES.map((source) => ({
    ...source,
    configured: isSourceConfigured(source.id),
    enabledByDefault: source.mode === 'core' || source.mode === 'supporting',
  }));
}
