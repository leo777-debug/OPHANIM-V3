export const POSITION_MAX_AGE_MS = 10 * 60_000;
export const REPORT_MAX_AGE_MS = 24 * 60 * 60_000;

export function sourceTime(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  let time: number;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) {
    const numeric = Number(value);
    time = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  } else if (typeof value === 'string') {
    // Source feeds commonly publish UTC timestamps without an explicit offset.
    const utc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)
      ? `${value.replace(' ', 'T')}Z` : value;
    time = Date.parse(utc);
  } else return null;
  return Number.isFinite(time) && time >= Date.UTC(2000, 0, 1) ? time : null;
}

export function isRecentObservation(value: unknown, maxAgeMs: number, now = Date.now()): boolean {
  const time = sourceTime(value);
  return time !== null && time <= now && now - time <= maxAgeMs;
}

export function adsbObservationTime(aircraft: Record<string, unknown>, snapshotTime: unknown): number | null {
  const now = sourceTime(snapshotTime);
  const age = aircraft.seen_pos;
  return now !== null && typeof age === 'number' && Number.isFinite(age) && age >= 0
    ? now - age * 1000 : null;
}

type Row = Record<string, unknown>;
export type AtlasFeedSnapshot = { checkedAt: number; sourceFetchedAt: number | null; withheld?: number; error?: string };
export type AtlasFeedStatus = {
  label: string; endpoint: string; current: number; withheld: number;
  latestObservation: number | null; checkedAt: number | null; reason: string | null;
};

const FEEDS = [
  { endpoint: '/api/flights', label: 'Aircraft positions', keys: ['commercial_flights', 'private_flights', 'private_jets', 'military_flights'], age: POSITION_MAX_AGE_MS, fields: ['observedAt'], refreshMs: 120_000 },
  { endpoint: '/api/maritime', label: 'Vessel positions', keys: ['maritime_ships'], age: POSITION_MAX_AGE_MS, fields: ['observedAt', 'timestamp'], refreshMs: 60_000 },
  { endpoint: '/api/earthquakes', label: 'Earthquakes', keys: ['earthquakes'], age: REPORT_MAX_AGE_MS, fields: ['time'], refreshMs: 300_000 },
  { endpoint: '/api/news', label: 'News', keys: ['news'], age: REPORT_MAX_AGE_MS, fields: ['published'], refreshMs: 300_000 },
  { endpoint: '/api/fires', label: 'Fire detections', keys: ['fires'], age: REPORT_MAX_AGE_MS, fields: ['observedAt'], refreshMs: 600_000 },
  { endpoint: '/api/weather', label: 'Weather alerts', keys: ['weather_events'], age: REPORT_MAX_AGE_MS, fields: ['date'], refreshMs: 300_000 },
  { endpoint: '/api/gdelt', label: 'GDACS incidents', keys: ['gdelt'], age: REPORT_MAX_AGE_MS, fields: ['date'], refreshMs: 300_000 },
  { endpoint: '/api/malware', label: 'Cyber reports', keys: ['malware_threats'], age: REPORT_MAX_AGE_MS, fields: ['last_online', 'first_seen'], refreshMs: 300_000 },
  { endpoint: '/api/cyber-threats', label: 'Updated cyber advisories', keys: ['cyberThreats'], age: REPORT_MAX_AGE_MS, fields: ['modified', 'listedAt', 'published'], refreshMs: 1800_000 },
] as const;

export function filterCurrentAtlasData(
  raw: Record<string, unknown>, snapshots: Record<string, AtlasFeedSnapshot>, now: number,
): { data: Record<string, unknown>; feeds: AtlasFeedStatus[] } {
  const data = { ...raw };
  const feeds: AtlasFeedStatus[] = [];
  for (const feed of FEEDS) {
    const snapshot = snapshots[feed.endpoint];
    if (!snapshot) continue;
    const expired = snapshot.sourceFetchedAt === null || now - snapshot.sourceFetchedAt > feed.refreshMs * 3
      || snapshot.sourceFetchedAt > now;
    let current = 0, withheld = snapshot.withheld ?? 0, latestObservation: number | null = null;
    for (const key of feed.keys) {
      const rows = Array.isArray(raw[key]) ? raw[key] as Row[] : [];
      data[key] = rows.filter((row) => {
        if (!row || typeof row !== 'object') { withheld++; return false; }
        let observedAt = feed.fields.map((field) => sourceTime(row[field])).find((time) => time !== null) ?? null;
        if (key === 'cyberThreats') {
          const updates = feed.fields.map((field) => sourceTime(row[field])).filter((time): time is number => time !== null);
          observedAt = updates.length ? Math.max(...updates) : null;
        }
        if (key === 'fires' && observedAt === null && typeof row.date === 'string') {
          const hhmm = String(row.time ?? '').padStart(4, '0');
          if (/^\d{4}$/.test(hhmm)) observedAt = sourceTime(`${row.date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
        }
        if (observedAt !== null && observedAt <= now) latestObservation = Math.max(latestObservation ?? 0, observedAt);
        const expires = sourceTime(row.expires);
        const activeAlert = key === 'weather_events' && expires !== null && expires > now
          && observedAt !== null && observedAt <= now;
        const recent = observedAt !== null && isRecentObservation(observedAt, feed.age, now);
        const valid = !expired && (activeAlert || recent) && (expires === null || expires > now);
        if (valid) current++; else withheld++;
        return valid;
      });
    }
    // Derived locations cannot outlive the underlying aircraft observations.
    if (feed.endpoint === '/api/flights' && (expired || withheld > 0)) data.gps_jamming = [];
    feeds.push({ label: feed.label, endpoint: feed.endpoint, current, withheld, latestObservation,
      checkedAt: snapshot.checkedAt,
      reason: snapshot.error || (expired ? 'Source snapshot expired or has no fetch timestamp.'
        : current === 0 ? 'No recent, dated observations available.' : null),
    });
  }
  return { data, feeds };
}
