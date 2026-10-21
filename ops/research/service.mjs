import { createServer } from 'node:http';
import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';
import sources from '../../src/lib/intelligence/research-sources.json' with { type: 'json' };

const allowedUrls = new Set(sources.filter(source => source.commercialUse === 'yes').map(source => source.url));
const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['192.0.2.0', 24],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(network, prefix);
const publicV6 = new BlockList(); publicV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
export const publicAddress = address => isIP(address) === 4 ? !blocked.check(address, 'ipv4')
  : isIP(address) === 6 && publicV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');

/** Fixed government endpoints only; pinned public DNS, no redirects, no credentials. */
export async function fetchOfficialJson(target) {
  if (!allowedUrls.has(target)) throw new Error('Source not permitted.');
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    controller.abort(); reject(new Error('Source timed out.'));
  }, 8000); });
  try {
    const url = new URL(target);
    const addresses = await Promise.race([lookup(url.hostname, { all: true }), timeout]);
    if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw new Error('Source address blocked.');
    if (controller.signal.aborted) throw new Error('Source timed out.');
    const address = addresses[0].address;
    return await Promise.race([new Promise((resolve, reject) => {
      const outgoing = request(url, { signal: controller.signal, agent: false,
        lookup: (_host, options, done) => options.all ? done(null, [{ address, family: isIP(address) }]) : done(null, address, isIP(address)),
        headers: { Accept: 'application/geo+json, application/json', 'Accept-Encoding': 'identity',
          'User-Agent': 'Ophanim-public-safety-research/1.0 (https://github.com/leo777-debug/OPHANIM-V3)' } }, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error('Source unavailable.')); return; }
        let size = 0; const chunks = [];
        response.on('data', chunk => { size += chunk.length; if (size > 4_000_000) response.destroy(new Error('Source too large.')); else chunks.push(chunk); });
        response.on('error', () => reject(new Error('Source interrupted.')));
        response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid source JSON.')); } });
      });
      outgoing.on('error', () => reject(new Error('Source unavailable.'))); outgoing.end();
    }), timeout]);
  } finally { clearTimeout(timer); controller.abort(); }
}
const text = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
const date = (value, now) => {
  const time = typeof value === 'number' || typeof value === 'string' ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) && time <= now + 300000 ? new Date(time).toISOString() : undefined;
};
function normalize(source, payload, now) {
  if (!payload || !Array.isArray(payload.features) || payload.features.length > 10000) throw new Error('Invalid feature collection.');
  return payload.features.flatMap(feature => {
    const properties = feature?.properties ?? {}, quake = source.format === 'usgs';
    const title = text(quake ? properties.title : properties.headline || properties.event).slice(0, 300);
    const excerpt = text(quake ? properties.place : properties.description).slice(0, 1200);
    let url;
    try { url = new URL(quake ? properties.url : properties['@id'] || feature.id); } catch { return []; }
    if (!title || url.protocol !== 'https:' || url.username || url.password ||
      ![new URL(source.url).hostname, 'www.weather.gov', 'alerts.weather.gov'].includes(url.hostname)) return [];
    const publishedAt = date(quake ? properties.time : properties.sent, now);
    return [{ title, url: url.toString(), excerpt, ...(publishedAt ? { publishedAt } : {}),
      sourceId: source.id, attribution: source.attribution, licence: source.licence, trustTier: 'official' }];
  });
}

export function createResearchEngine({ fetcher = fetchOfficialJson, now = Date.now } = {}) {
  const caches = new Map();
  async function load(source) {
    const previous = caches.get(source.id);
    if (previous && now() - previous.checkedAt < 300000) return previous.pending;
    const pending = (async () => {
      try {
        const items = normalize(source, await fetcher(source.url), now());
        return { sourceId: source.id, status: 'available', fetchedAt: new Date(now()).toISOString(), items };
      } catch { return { sourceId: source.id, status: 'unavailable', fetchedAt: null, items: [] }; }
    })();
    caches.set(source.id, { checkedAt: now(), pending }); return pending;
  }
  return async input => {
    if (!input || typeof input.subject !== 'string' || input.subject.trim().length < 2 || input.subject.length > 500 ||
      !['confirm', 'assess_risk'].includes(input.purpose) || (input.context !== undefined && (typeof input.context !== 'string' || input.context.length > 8000)) ||
      input.policy?.allowOperationalActions !== false || input.policy?.requireSourceAttribution !== true) throw new Error('Invalid research request.');
    // Query/context never leave this process. Token matching is deterministic, not AI.
    const tokens = [...new Set(input.subject.toLocaleLowerCase('en').match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 30);
    const observations = await Promise.all(sources.filter(source => source.commercialUse === 'yes').map(load));
    const matches = observations.flatMap(source => source.items.map(item => ({
      item, score: tokens.filter(token => (item.title + ' ' + item.excerpt).toLocaleLowerCase('en').includes(token)).length,
    }))).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.item.url.localeCompare(b.item.url)).slice(0, 12).map(row => row.item);
    const unavailable = observations.filter(source => source.status === 'unavailable').length;
    return {
      summary: `Deterministic official-feed lookup: ${matches.length} matching notices in the two permitted feeds. ${unavailable} feeds unavailable. This does not confirm the subject or establish risk.`,
      riskIndicator: 'unknown', uncertainty: 'Keyword overlap is not corroboration. No match does not imply safety or absence of disruption.',
      sources: matches, collectedAt: observations.filter(row => row.fetchedAt).map(row => row.fetchedAt).sort()[0] ?? null,
      limitations: ['USGS magnitude 4.5+ past-day earthquakes and active US NWS warnings only; no global news or port-notice search.',
        'No AI inference, browser execution, arbitrary URL fetching or operational actions. Context is ignored and never sent upstream.',
        'Per-source five-minute cache, including failures. Publication times are source-supplied or unknown.',
        ...observations.map(row => `${row.sourceId}: ${row.status}; fetched ${row.fetchedAt ?? 'never'}.`)],
      method: 'deterministic-keyword-overlap', sourceHealth: observations.map(({ items, ...row }) => ({ ...row, itemCount: items.length })),
    };
  };
}
const digest = value => createHash('sha256').update(value).digest();
export function createResearchServer({ token = '', research = createResearchEngine(), now = Date.now } = {}) {
  // One organization-facing app per worker token; no tenant data persistence.
  let windowStart = now(), requests = 0, active = 0;
  const server = createServer(async (request, response) => {
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(body)); };
    if (!token || token.length < 32) { send(503, { error: 'Research service not configured. Set a dedicated token of at least 32 characters.' }); return; }
    const supplied = request.headers.authorization ?? '';
    if (!timingSafeEqual(digest(supplied), digest(`Bearer ${token}`))) { send(401, { error: 'Authentication required.' }); return; }
    if (request.method === 'GET' && request.url === '/health') { send(200, { status: 'ready', mode: 'restricted-official-feeds', upstreamTested: false }); return; }
    if (request.method !== 'POST' || request.url !== '/v1/research') { send(404, { error: 'Unknown research endpoint.' }); return; }
    if (now() - windowStart >= 60000) { windowStart = now(); requests = 0; }
    if (++requests > 20 || active >= 2) { send(429, { error: 'Research limit reached; try later.' }); return; }
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) { send(415, { error: 'Use application/json.' }); return; }
    active++;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 16000) { send(413, { error: 'Research request too large.' }); request.resume(); return; }
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      let result;
      try { result = await research(input); } catch { send(400, { error: 'Invalid or unavailable research request.' }); return; }
      send(200, result);
    } catch { if (!response.headersSent) send(400, { error: 'Invalid research request.' }); }
    finally { active--; }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.timeout = 20000;
  server.maxHeadersCount = 40; server.maxConnections = 32;
  return server;
}
