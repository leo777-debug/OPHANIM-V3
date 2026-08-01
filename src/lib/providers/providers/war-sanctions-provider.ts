import { findWarSanctionsVessels, getWarSanctionsMapVessels, getWarSanctionsVessel, type WarSanctionsVessel } from '@/lib/war-sanctions';
import type { Provider, ProviderMapLayer } from '../types';

function sourceLink(vessel: WarSanctionsVessel): string {
  return `/entity/war-sanctions/vessels/${vessel.catalogue}/${vessel.id}`;
}

function toLayer(id: string, name: string, color: string, vessels: WarSanctionsVessel[]): ProviderMapLayer {
  const features = vessels.flatMap((vessel) => vessel.ports.map((port) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [port.lng, port.lat] },
    properties: {
      entityType: 'port', port: port.name, vessel: vessel.name, imo: vessel.imo,
      classification: vessel.isShadowFleet ? 'Shadow Fleet' : 'Sanctioned vessel',
      catalogue: vessel.catalogue,
      sourceUrl: vessel.sourceUrl,
    },
  })));
  return {
    id, provider: 'war-sanctions', name, geometry: 'point',
    source: { type: 'FeatureCollection', features },
    style: { color, opacity: 0.86, radius: 5, outlineColor: '#07151b' }, visible: true, interactive: true,
  };
}

export const warSanctionsProvider: Provider = {
  metadata: {
    name: 'war-sanctions', description: 'GUR War & Sanctions public vessel and Shadow Fleet catalogue.',
    supportedEntityTypes: ['vessel', 'imo', 'mmsi', 'command'],
    supportedIntents: ['vessel_lookup', 'imo_lookup', 'mmsi_lookup', 'map_command'],
    supportsMapLayers: true, requiresCredentials: false, timeoutMs: 30000, enabled: true, priority: 8,
  },
  async execute(query, context) {
    if (query.intent === 'map_command') return [];
    const candidates = await findWarSanctionsVessels(query.query ?? '', context.signal);
    const filtered = candidates.filter((vessel) => {
      const target = (query.query ?? '').toLowerCase();
      return !target || [vessel.name, vessel.imo, vessel.mmsi].filter(Boolean).some((value) => value!.toLowerCase().includes(target));
    }).slice(0, query.limit);
    return Promise.all(filtered.map((vessel) => getWarSanctionsVessel(vessel.id, vessel.catalogue, context.signal)));
  },
  normalize(raw, query) {
    if (query.intent === 'map_command') return [];
    return (raw as WarSanctionsVessel[]).map((vessel) => ({
      id: `war-sanctions:${vessel.id}`, label: vessel.name, type: 'vessel', category: 'sanctions', importance: vessel.isShadowFleet ? 1 : 0.92,
      zoomLevel: 0, provider: 'war-sanctions',
      summary: [vessel.isShadowFleet ? 'GUR Shadow Fleet' : 'GUR sanctioned vessel', vessel.imo ? `IMO ${vessel.imo}` : undefined, vessel.mmsi ? `MMSI ${vessel.mmsi}` : undefined, vessel.flag].filter(Boolean).join(' | '),
      action: { type: 'open_entity', href: sourceLink(vessel) },
    }));
  },
  async createMapLayers(context) {
    if (context.requestedProviders && !context.requestedProviders.includes('war-sanctions')) return [];
    const [shadowFleet, sanctioned] = await Promise.all([
      getWarSanctionsMapVessels('shadow-fleet', context.signal),
      getWarSanctionsMapVessels('ships', context.signal),
    ]);
    return [
      toLayer('war-sanctions-shadow-fleet-ports', 'GUR Shadow Fleet associated ports', '#ff4d6d', shadowFleet),
      toLayer('war-sanctions-sanctioned-vessel-ports', 'Sanctioned vessel associated ports', '#f6c453', sanctioned),
    ];
  },
};
