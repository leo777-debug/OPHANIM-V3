import type { FeedId, PresentationFeed } from './types';

// Only already-sanitized public feeds cross into the original atlas renderer.
export function atlasPresentationData(feeds: Partial<Record<FeedId, PresentationFeed>>, hidden: ReadonlySet<FeedId>) {
  const feed = (id: FeedId) => !hidden.has(id) && feeds[id]?.state !== 'unavailable' ? feeds[id] : undefined;
  const rows = (id: FeedId): Record<string, unknown>[] => (feed(id)?.features ?? []).filter(f => f.geometry.type === 'Point').map(f => ({ ...f.properties }));
  const flights: Record<string, unknown>[] = rows('flights').map(p => ({ ...p, callsign: p.callsign || p.name }));
  const enabled = (id: FeedId) => Boolean(feed(id)) && !hidden.has(id);
  return {
    data: {
      commercial_flights: flights.filter(p => !['private','jet','military'].includes(String(p.aircraft_category))),
      private_flights: flights.filter(p => p.aircraft_category === 'private'),
      private_jets: flights.filter(p => p.aircraft_category === 'jet'),
      military_flights: flights.filter(p => p.aircraft_category === 'military'),
      flight_source: feed('flights')?.source, flight_timestamp: feed('flights')?.observedAt,
      maritime_ships: rows('maritime'), maritime_sources: feed('maritime') ? [feed('maritime')!.source] : [], maritime_timestamp: feed('maritime')?.observedAt,
      maritime_ports: rows('ports'), maritime_chokepoints: rows('chokepoints'),
      cameras: rows('cameras'), live_feeds: rows('broadcasts').map(p=>({...p,url:p.sourceUrl})),
      infrastructure: rows('infrastructure'), conflict_markers: rows('conflicts'), public_sanctions: rows('war-sanctions'),
      earthquakes: rows('earthquakes').map((p):Record<string,unknown> => ({ ...p, place: p.name })),
      satellites: rows('satellites'), gdelt: rows('incidents'), fires: rows('fires'),
      weather_events: rows('weather').map(p => ({ ...p, title: p.name })),
      malware_threats: rows('cyber').map(p => ({ ...p, malware: p.name })),
      submarine_cables: feed('cables')?.features ?? [], news: feed('news')?.news ?? [],
    },
    activeLayers: {
      flights: enabled('flights'), private: enabled('flights'), jets: enabled('flights'), military: enabled('flights'),
      maritime: enabled('maritime') || enabled('ports') || enabled('chokepoints'), ship_cargo: true, ship_tanker: true, ship_passenger: true, ship_fishing: true, ship_military: true,
      cctv: enabled('cameras'), live_news: enabled('broadcasts'), infrastructure: enabled('infrastructure'), war_sanctions: enabled('war-sanctions'),
      earthquakes: enabled('earthquakes'), satellites: enabled('satellites'), global_incidents: enabled('incidents'),
      fires: enabled('fires'), weather: enabled('weather'), malware: enabled('cyber'), news_intel: enabled('news'),
      sdk_sea: enabled('cables'), sdk_air: false, sdk_naval: false, conflict_zones: enabled('conflicts'),
    },
  };
}

export function pickPublicMapPoint(
  feeds: Partial<Record<FeedId, PresentationFeed>>, hidden: ReadonlySet<FeedId>, point: {x:number;y:number},
  project: (lng:number,lat:number) => {x:number;y:number}, occluded: (lng:number,lat:number) => boolean,
) {
  let closest: Record<string, unknown> | null = null, distance = 12;
  for (const feed of Object.values(feeds)) {
    if (feed.state === 'unavailable' || hidden.has(feed.id)) continue;
    for (const feature of feed.features) {
      if (feature.geometry.type !== 'Point') continue;
      const coordinates = feature.geometry.coordinates;
      if (!Array.isArray(coordinates) || typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') continue;
      const lng = coordinates[0], lat = coordinates[1];
      if (occluded(lng,lat)) continue;
      const position = project(lng,lat), delta = Math.hypot(position.x-point.x,position.y-point.y);
      if (delta < distance) { distance = delta; closest = { ...feature.properties, provider:feed.id }; }
    }
  }
  return closest;
}
