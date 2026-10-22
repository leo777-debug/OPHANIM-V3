// Availability probes only. No keys, feed bodies, or private endpoints are read.
import { writeFileSync } from 'node:fs';
import { INTEGRATIONS } from '../src/lib/integrations/catalog.ts';
const probes = INTEGRATIONS.filter(item => item.probe).map(item => ({ id: item.id, url: item.probe }));
probes.push(
  { id: 'news-bbc', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'news-aljazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'news-gdacs', url: 'https://www.gdacs.org/xml/rss.xml' },
  { id: 'news-nasa', url: 'https://www.nasa.gov/news-release/feed/' },
  { id: 'news-cisa', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
  ...['OSINTtechnical', 'Faytuks', 'Liveuamap', 'CyberKnow'].map(channel => ({ id: `telegram-${channel}`, url: `https://t.me/s/${channel}` })),
);
const results = [];
// Limit concurrent connections and do not retry a reachability audit.
for (let offset = 0; offset < probes.length; offset += 4) {
  results.push(...await Promise.all(probes.slice(offset, offset + 4).map(async probe => {
    const started = Date.now();
    try {
      const response = await fetch(probe.url, { signal: AbortSignal.timeout(10000), redirect: 'error', headers: { 'User-Agent': 'Ophanim/1.0 (availability audit)' } });
      await response.body?.cancel();
      return { ...probe, checkedAt: new Date().toISOString(), httpStatus: response.status, reachable: response.ok, latencyMs: Date.now() - started, scope: 'HTTP reachability only; content and freshness not validated' };
    } catch { return { ...probe, checkedAt: new Date().toISOString(), reachable: false, latencyMs: Date.now() - started, error: 'Network failure, redirect or timeout; upstream details redacted', scope: 'HTTP reachability only' }; }
  })));
}
writeFileSync('PARITY/feed-audit.json', JSON.stringify({ results, untested: 'Other existing providers/cameras, configured/keyed sources and payload parsers still require an audit.' }, null, 2) + '\n');
console.log(JSON.stringify({ tested: results.length, reachable: results.filter(item => item.reachable).length, failed: results.filter(item => !item.reachable).map(item => item.id) }));
