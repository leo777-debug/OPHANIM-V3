export type WorldMonitorLayerGroup =
  | "Geopolitical"
  | "Military & strategic"
  | "Maritime & transport"
  | "Infrastructure & cyber"
  | "Environment & health"
  | "Economy & trade"
  | "Technology"
  | "Positive global";

export type WorldMonitorLayer = {
  key: string;
  label: string;
  group: WorldMonitorLayerGroup;
  source: string;
  embedId?: string;
  ophanimKey?: string;
};

const layer = (
  key: string,
  label: string,
  group: WorldMonitorLayerGroup,
  source: string,
  options: Pick<WorldMonitorLayer, "embedId" | "ophanimKey"> = {},
): WorldMonitorLayer => ({ key, label, group, source, ...options });

/**
 * WorldMonitor's current visible-layer catalog. Names describe the upstream
 * product surface; embedId is present only where its public embed supports it.
 */
export const WORLD_MONITOR_LAYERS: WorldMonitorLayer[] = [
  layer("iranAttacks", "Iran attack events", "Geopolitical", "WorldMonitor API"),
  layer("hotspots", "Geopolitical hotspots", "Geopolitical", "WorldMonitor API", { ophanimKey: "global_incidents" }),
  layer("conflicts", "Active conflicts", "Geopolitical", "WorldMonitor public embed", { embedId: "conflicts", ophanimKey: "conflict_zones" }),
  layer("protests", "Protests and unrest", "Geopolitical", "WorldMonitor public embed", { embedId: "protests", ophanimKey: "global_incidents" }),
  layer("ucdpEvents", "UCDP conflict events", "Geopolitical", "WorldMonitor API", { ophanimKey: "conflict_zones" }),
  layer("displacement", "Displacement", "Geopolitical", "WorldMonitor API"),
  layer("sanctions", "Sanctions", "Geopolitical", "Ophanim / provider feed", { ophanimKey: "war_sanctions" }),

  layer("bases", "Military bases", "Military & strategic", "WorldMonitor API"),
  layer("nuclear", "Nuclear facilities", "Military & strategic", "Ophanim / open feed", { ophanimKey: "infrastructure" }),
  layer("irradiators", "Gamma irradiators", "Military & strategic", "WorldMonitor API"),
  layer("radiationWatch", "Radiation watch", "Military & strategic", "Ophanim connector", { ophanimKey: "radiation" }),
  layer("spaceports", "Spaceports", "Military & strategic", "WorldMonitor API", { ophanimKey: "satellites" }),
  layer("satellites", "Satellites", "Military & strategic", "Ophanim / open feed", { ophanimKey: "satellites" }),
  layer("military", "Military aircraft", "Military & strategic", "Ophanim / open feed", { ophanimKey: "military" }),
  layer("gpsJamming", "GPS interference", "Military & strategic", "Ophanim / open feed", { ophanimKey: "gps_jamming" }),

  layer("ais", "AIS vessel traffic", "Maritime & transport", "Ophanim / AIS connectors", { ophanimKey: "maritime" }),
  layer("liveTankers", "Live tanker tracking", "Maritime & transport", "WorldMonitor API", { ophanimKey: "maritime" }),
  layer("tradeRoutes", "Trade routes", "Maritime & transport", "WorldMonitor public embed", { embedId: "tradeRoutes", ophanimKey: "maritime" }),
  layer("waterways", "Strategic waterways", "Maritime & transport", "WorldMonitor public embed", { embedId: "waterways", ophanimKey: "maritime" }),
  layer("flights", "Commercial flights", "Maritime & transport", "Ophanim / open feed", { ophanimKey: "flights" }),
  layer("canadaRoads", "Canada road conditions", "Maritime & transport", "WorldMonitor API", { ophanimKey: "camera_transport" }),
  layer("canadaAlerts", "Canada transport alerts", "Maritime & transport", "WorldMonitor API", { ophanimKey: "weather" }),

  layer("cables", "Submarine cables", "Infrastructure & cyber", "WorldMonitor public embed", { embedId: "cables", ophanimKey: "sdk_sea" }),
  layer("pipelines", "Oil and gas pipelines", "Infrastructure & cyber", "WorldMonitor public embed", { embedId: "pipelines" }),
  layer("datacenters", "Data centers", "Infrastructure & cyber", "WorldMonitor API"),
  layer("outages", "Internet outages", "Infrastructure & cyber", "Ophanim connector", { ophanimKey: "internet_outages" }),
  layer("cyberThreats", "Cyber threats", "Infrastructure & cyber", "Ophanim / open feed", { ophanimKey: "malware" }),
  layer("storageFacilities", "Energy storage facilities", "Infrastructure & cyber", "WorldMonitor API"),
  layer("fuelShortages", "Fuel shortages", "Infrastructure & cyber", "WorldMonitor API"),

  layer("natural", "Earthquakes and hazards", "Environment & health", "WorldMonitor public embed", { embedId: "earthquakes", ophanimKey: "earthquakes" }),
  layer("fires", "Wildfires", "Environment & health", "Ophanim / open feed", { ophanimKey: "fires" }),
  layer("weather", "Severe weather", "Environment & health", "WorldMonitor public embed", { embedId: "weather", ophanimKey: "weather" }),
  layer("climate", "Climate anomalies", "Environment & health", "WorldMonitor API"),
  layer("dayNight", "Day and night", "Environment & health", "Ophanim calculated layer", { ophanimKey: "day_night" }),
  layer("webcams", "Public webcams", "Environment & health", "Ophanim / open feed", { ophanimKey: "cctv" }),
  layer("diseaseOutbreaks", "Disease outbreaks", "Environment & health", "WorldMonitor API"),

  layer("economic", "Economic indicators", "Economy & trade", "WorldMonitor public embed", { embedId: "economic" }),
  layer("minerals", "Critical minerals", "Economy & trade", "WorldMonitor API"),
  layer("stockExchanges", "Stock exchanges", "Economy & trade", "WorldMonitor public embed", { embedId: "stockExchanges" }),
  layer("financialCenters", "Financial centers", "Economy & trade", "WorldMonitor public embed", { embedId: "financialCenters" }),
  layer("centralBanks", "Central banks", "Economy & trade", "WorldMonitor public embed", { embedId: "centralBanks" }),
  layer("commodityHubs", "Commodity hubs", "Economy & trade", "WorldMonitor public embed", { embedId: "commodityHubs" }),
  layer("gulfInvestments", "Gulf investments", "Economy & trade", "WorldMonitor public embed", { embedId: "gulfInvestments" }),
  layer("miningSites", "Mining sites", "Economy & trade", "WorldMonitor API"),
  layer("processingPlants", "Mineral processing plants", "Economy & trade", "WorldMonitor API"),
  layer("commodityPorts", "Commodity ports", "Economy & trade", "WorldMonitor API"),
  layer("ciiChoropleth", "Critical infrastructure index", "Economy & trade", "WorldMonitor API"),
  layer("resilienceScore", "National resilience score", "Economy & trade", "WorldMonitor API"),

  layer("startupHubs", "Startup hubs", "Technology", "WorldMonitor API"),
  layer("techHQs", "Technology headquarters", "Technology", "WorldMonitor API"),
  layer("accelerators", "Accelerators", "Technology", "WorldMonitor API"),
  layer("cloudRegions", "Cloud regions", "Technology", "WorldMonitor API"),
  layer("techEvents", "Technology events", "Technology", "WorldMonitor API"),

  layer("positiveEvents", "Positive global events", "Positive global", "WorldMonitor API"),
  layer("kindness", "Acts of kindness", "Positive global", "WorldMonitor API"),
  layer("happiness", "Happiness signals", "Positive global", "WorldMonitor API"),
  layer("speciesRecovery", "Species recovery", "Positive global", "WorldMonitor API"),
  layer("renewableInstallations", "Renewable installations", "Positive global", "WorldMonitor API"),
];

export const WORLD_MONITOR_LAYER_GROUPS = [
  "Geopolitical",
  "Military & strategic",
  "Maritime & transport",
  "Infrastructure & cyber",
  "Environment & health",
  "Economy & trade",
  "Technology",
  "Positive global",
] as const satisfies readonly WorldMonitorLayerGroup[];

export const WORLD_MONITOR_PUBLIC_LAYER_IDS = WORLD_MONITOR_LAYERS.flatMap(
  (item) => (item.embedId ? [item.embedId] : []),
);
