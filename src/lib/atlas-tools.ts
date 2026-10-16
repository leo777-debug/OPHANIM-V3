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
] as const;

export type AtlasTool = typeof ATLAS_TOOLS[number]['id'];

export function parseAtlasTool(value: unknown): AtlasTool | null {
  return ATLAS_TOOLS.some(tool => tool.id === value) ? value as AtlasTool : null;
}

export function atlasToolHref(tool: AtlasTool): string {
  return `/atlas?tool=${tool}`;
}
