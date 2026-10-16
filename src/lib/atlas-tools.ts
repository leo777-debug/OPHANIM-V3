export const ATLAS_TOOLS = [
  { id: 'analyst', label: 'Analyst', description: 'AI briefing and summaries' },
  { id: 'fusion', label: 'Fusion', description: 'Combined intelligence signals' },
  { id: 'recon', label: 'Recon', description: 'DNS, domain and network tools' },
  { id: 'markets', label: 'Markets', description: 'Market feeds' },
  { id: 'alerts', label: 'Alerts', description: 'Live feed alerts' },
  { id: 'entities', label: 'Entities', description: 'Entity relationship graph' },
  { id: 'search', label: 'Search', description: 'Places, domains and map layers' },
  { id: 'shodan', label: 'Shodan IP lookup', description: 'Read-only Shodan InternetDB records' },
  { id: 'ip', label: 'IP search', description: 'IP intelligence and location search' },
  { id: 'tracking', label: 'Vessels & aircraft', description: 'Enable positions and search targets' },
  { id: 'news', label: 'Intel Desk', description: 'News, timeline, regions and clocks' },
  { id: 'settings', label: 'AI setup', description: 'API provider or local model' },
  { id: 'watchlists', label: 'Watchlists', description: 'Saved target monitoring' },
  { id: 'sources', label: 'Sources', description: 'Feed health and observation times' },
  { id: 'logistics', label: 'Logistics', description: 'Ports, chokepoints and supply chain context' },
] as const;

export type AtlasTool = typeof ATLAS_TOOLS[number]['id'];

export function parseAtlasTool(value: unknown): AtlasTool | null {
  return ATLAS_TOOLS.some(tool => tool.id === value) ? value as AtlasTool : null;
}

export function atlasToolHref(tool: AtlasTool): string {
  return `/logistics/map?tool=${tool}`;
}
