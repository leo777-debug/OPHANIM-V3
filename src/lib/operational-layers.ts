/** Ophanim's native map controls. A control is not proof of upstream health. */
export type OperationalLayerGroup = 'Hazards' | 'Transport' | 'Infrastructure' | 'Intelligence';
export type OperationalLayer = { key: string; label: string; group: OperationalLayerGroup; source: string; ophanimKey: string };
export const OPERATIONAL_LAYERS: OperationalLayer[] = [
  { key: 'flights', label: 'Aircraft', group: 'Transport', source: 'Configured public ADS-B sources; coverage varies', ophanimKey: 'flights' },
  { key: 'maritime', label: 'Vessels', group: 'Transport', source: 'Digitraffic or configured licensed AIS', ophanimKey: 'maritime' },
  { key: 'ship_cargo', label: 'Cargo vessels', group: 'Transport', source: 'Configured maritime feed', ophanimKey: 'ship_cargo' },
  { key: 'ship_tanker', label: 'Tankers', group: 'Transport', source: 'Configured maritime feed', ophanimKey: 'ship_tanker' },
  { key: 'earthquakes', label: 'Earthquakes', group: 'Hazards', source: 'USGS Earthquake Hazards', ophanimKey: 'earthquakes' },
  { key: 'fires', label: 'Fires', group: 'Hazards', source: 'NASA FIRMS / EONET', ophanimKey: 'fires' },
  { key: 'weather', label: 'Weather warnings', group: 'Hazards', source: 'NOAA / GDACS / NASA', ophanimKey: 'weather' },
  { key: 'infrastructure', label: 'Infrastructure reference', group: 'Infrastructure', source: 'Packaged reference data; asset status not implied', ophanimKey: 'infrastructure' },
  { key: 'cables', label: 'Undersea cable reference', group: 'Infrastructure', source: 'Ophanim cable provider; reference geometry', ophanimKey: 'sdk_sea' },
  { key: 'outages', label: 'Connectivity outages', group: 'Infrastructure', source: 'IODA; source availability varies', ophanimKey: 'internet_outages' },
  { key: 'incidents', label: 'Disaster incidents', group: 'Intelligence', source: 'GDACS; not a GDELT conflict feed', ophanimKey: 'global_incidents' },
  { key: 'news', label: 'News', group: 'Intelligence', source: 'Attributed publisher reports', ophanimKey: 'news_intel' },
  { key: 'sanctions', label: 'Sanctions reference', group: 'Intelligence', source: 'Configured sanctions providers', ophanimKey: 'war_sanctions' },
  { key: 'cyber', label: 'Cyber indicators', group: 'Intelligence', source: 'Configured cyber-threat providers', ophanimKey: 'malware' },
];
export const OPERATIONAL_LAYER_GROUPS = ['Hazards', 'Transport', 'Infrastructure', 'Intelligence'] as const;
