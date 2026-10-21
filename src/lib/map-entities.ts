export interface MapEntity {
  type: string;
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

export const supportsEntityEnrichment = (type: string): boolean =>
  ['aircraft', 'vessel', 'company', 'country'].includes(type);

export function mapEntity(item: Record<string, unknown>): MapEntity {
  const type = item.provider === 'maritime' ? 'vessel'
    : item.provider === 'flights' ? 'aircraft'
    : item.provider === 'cyber' && item.ip ? 'ip' : String(item.type ?? 'event');
  const id = type === 'vessel' ? item.mmsi ?? item.imo ?? item.id
    : type === 'aircraft' ? item.icao24 ?? item.id
    : type === 'ip' ? item.ip ?? item.id : item.id;
  return { type, id: String(id ?? item.name ?? ''), label: String(item.name ?? item.callsign ?? id ?? 'Observation'), properties: item };
}

export function searchMapEntities(items: Record<string, unknown>[], query: string, limit = 20): Record<string, unknown>[] {
  const term = query.trim().toLowerCase();
  const seen = new Set<string>();
  const matches: Record<string, unknown>[] = [];
  for (const item of items) {
    const entity = mapEntity(item);
    const key = `${item.provider}:${entity.type}:${entity.id}`;
    if (!entity.id || seen.has(key)) continue;
    if (![entity.label, entity.id, item.callsign, item.registration, item.imo, item.mmsi, item.source]
      .some(value => String(value ?? '').toLowerCase().includes(term))) continue;
    seen.add(key);
    matches.push(item);
    if (matches.length >= limit) break;
  }
  return matches;
}
