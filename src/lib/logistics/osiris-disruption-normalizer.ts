import type { DisruptionType } from './disruption-validation';

export interface NormalizedOsirisDisruption {
  provider: 'osiris-conflicts' | 'usgs-earthquakes';
  source: string;
  sourceReference: string;
  title: string;
  description?: string;
  disruptionType: DisruptionType;
  severity: number;
  confidence: number;
  effectiveAt?: string;
  reportedAt?: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
}

interface ConflictEvent { id?: string; title?: string; url?: string; timestamp?: string; lat?: number; lng?: number; }
interface Earthquake { id?: string; magnitude?: number; place?: string; time?: number | string; lat?: number; lng?: number; depth?: number; url?: string; }

function coordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function conflictSeverity(title: string): number {
  const value = title.toLowerCase();
  return /missile|ship attack|airstrike|blockade|houthi/.test(value) ? 5 : 4;
}

export function normalizeConflictEvents(payload: unknown): NormalizedOsirisDisruption[] {
  const events = Array.isArray((payload as { liveEvents?: unknown })?.liveEvents) ? (payload as { liveEvents: ConflictEvent[] }).liveEvents : [];
  return events.flatMap((event) => {
    if (!event.id || !event.title || !event.url || !coordinates(event.lat, event.lng)) return [];
    return [{ provider: 'osiris-conflicts' as const, source: 'Ophanim Osiris conflict feed', sourceReference: event.id, title: event.title.slice(0, 300), description: 'Live conflict event normalized from the existing Ophanim conflict feed.', disruptionType: 'security' as const, severity: conflictSeverity(event.title), confidence: 70, effectiveAt: event.timestamp, reportedAt: event.timestamp, latitude: Number(event.lat), longitude: Number(event.lng), sourceUrl: event.url }];
  });
}

export function normalizeEarthquakes(payload: unknown): NormalizedOsirisDisruption[] {
  const earthquakes = Array.isArray((payload as { earthquakes?: unknown })?.earthquakes) ? (payload as { earthquakes: Earthquake[] }).earthquakes : [];
  return earthquakes.flatMap((event) => {
    if (!event.id || !event.url || !coordinates(event.lat, event.lng) || typeof event.magnitude !== 'number' || event.magnitude < 5) return [];
    const timestamp = typeof event.time === 'number' ? new Date(event.time).toISOString() : event.time;
    return [{ provider: 'usgs-earthquakes' as const, source: 'USGS earthquake feed', sourceReference: event.id, title: `M${event.magnitude.toFixed(1)} earthquake${event.place ? `: ${event.place}` : ''}`.slice(0, 300), description: [event.place, event.depth === undefined ? undefined : `Depth ${event.depth} km`].filter(Boolean).join(' | '), disruptionType: 'infrastructure' as const, severity: event.magnitude >= 7 ? 5 : event.magnitude >= 6 ? 4 : 3, confidence: 95, effectiveAt: timestamp, reportedAt: timestamp, latitude: Number(event.lat), longitude: Number(event.lng), sourceUrl: event.url }];
  });
}
