// Audit an already-running local Ophanim instance. No credentials are read.
import { writeFile } from 'node:fs/promises';
const endpoint = new URL('/api/public-intelligence?country=united-arab-emirates', process.argv[2] || 'http://localhost:3107');
if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Audit requires a local application instance.');
const response = await fetch(endpoint, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Audit API returned HTTP ${response.status}`);
const data = await response.json();
const audit = { checkedAt: data.checkedAt, coverage: data.coverage, diagnostics: data.diagnostics,
  sources: data.sources.map(source => {
    const events = data.events.filter(event => event.providerId === source.id);
    const dates = events.flatMap(event => event.startedAt ? [event.startedAt] : []).sort();
    return { ...source, normalizedCount: events.length, newestPublication: dates.at(-1) || null,
      fetchedAt: [...new Set(events.map(event => event.sources[0]?.retrievedAt).filter(Boolean))],
      dataModes: [...new Set(events.map(event => event.attributes.dataMode))],
      dateAnomalies: events.filter(event => event.attributes.publicationAnomaly).map(event => ({ id: event.externalId, reportedPublishedAt: event.attributes.reportedPublishedAt, message: event.attributes.publicationAnomaly })) };
  }),
  limitation: 'One local, point-in-time parse audit. Counts may be capped at 100/source. No completeness, continuous availability, legal endorsement or future-feed health guarantee.' };
await writeFile(new URL('./public-intelligence-audit.json', import.meta.url), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify({ checkedAt: audit.checkedAt, sources: audit.sources.length, diagnostics: audit.diagnostics }));
