import type { Provider } from '../types';

interface MaritimeVessel { mmsi?: number; name?: string; imo?: number | string; imoNumber?: number | string; shipType?: number; }
interface MaritimeLocation { properties?: { mmsi?: number; sog?: number; cog?: number; heading?: number }; geometry?: { coordinates?: [number, number] }; }

export const maritimeProvider: Provider = {
  metadata: {
    id: 'maritime-ais', name: 'maritime-ais', description: 'Live vessel lookup from public AIS data.', category: 'maritime',
    supportedEntityTypes: ['vessel', 'imo', 'mmsi'], supportedIntents: ['vessel_lookup', 'imo_lookup', 'mmsi_lookup'], supportsMapLayers: true,
    requiresCredentials: false, timeoutMs: 12000, enabled: true, priority: 10,
  },
  async createMapLayers() { return []; },
  async execute(query, context) {
    const [vesselsResponse, locationsResponse] = await Promise.all([
      fetch('https://meri.digitraffic.fi/api/ais/v1/vessels', { signal: context.signal, headers: { 'Digitraffic-User': 'OPHANIM-Intelligence-Atlas' } }),
      fetch('https://meri.digitraffic.fi/api/ais/v1/locations', { signal: context.signal, headers: { 'Digitraffic-User': 'OPHANIM-Intelligence-Atlas' } }),
    ]);
    if (!vesselsResponse.ok || !locationsResponse.ok) throw new Error('Public AIS source unavailable');
    const vessels = await vesselsResponse.json() as MaritimeVessel[];
    const locations = await locationsResponse.json() as { features?: MaritimeLocation[] };
    const queryText = (query.query ?? '').toLowerCase();
    const locationByMmsi = new Map((locations.features ?? []).map((feature) => [feature.properties?.mmsi, feature]));
    return vessels.filter((vessel) => {
      if (query.intent === 'mmsi_lookup') return String(vessel.mmsi) === queryText;
      if (query.intent === 'imo_lookup') return String(vessel.imo ?? vessel.imoNumber ?? '') === queryText;
      return String(vessel.name ?? '').toLowerCase().includes(queryText);
    }).slice(0, query.limit).map((vessel) => ({ vessel, location: locationByMmsi.get(vessel.mmsi) }));
  },
  normalize(raw) {
    return (raw as Array<{ vessel: MaritimeVessel; location?: MaritimeLocation }>).map(({ vessel, location }) => {
      const coordinates = location?.geometry?.coordinates;
      const imo = vessel.imo ?? vessel.imoNumber;
      return {
        id: `vessel:${vessel.mmsi}`, label: vessel.name?.trim() || `MMSI ${vessel.mmsi}`, type: 'vessel', category: 'maritime', importance: 1,
        zoomLevel: 9, provider: 'maritime-ais', summary: [vessel.mmsi ? `MMSI ${vessel.mmsi}` : undefined, imo ? `IMO ${imo}` : undefined].filter(Boolean).join(' | '),
        ...(coordinates ? { lat: coordinates[1], lng: coordinates[0] } : {}),
        action: { type: 'enable_layers' as const, layers: ['maritime'] },
      };
    });
  },
};
