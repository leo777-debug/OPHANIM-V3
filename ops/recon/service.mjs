import { createServer } from 'node:http';
import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';
import { publicAddress } from '../shared/public-address.mjs';
import { approvedTargets, canonicalTarget, MODES } from './targets.mjs';

const specialV6 = new BlockList();
for (const [network, prefix] of [['2001::',23],['2002::',16],['3fff::',20]]) specialV6.addSubnet(network,prefix,'ipv6');
const publicTargetAddress = address => publicAddress(address) && !(isIP(address) === 6 && specialV6.check(address,'ipv6'));
const exposedHeaders = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'server'];
/** One TLS-verified HEAD request to the approved public host on port 443. Never follows redirects. */
/** @param {string} host
 * @param {{resolve?: (host: string, options: {all: true}) => Promise<Array<{address: string}>>, send?: typeof request}} options */
export async function inspectHttps(host, { resolve = lookup, send = request } = {}) {
  if (canonicalTarget(host) !== host) throw new Error('Invalid target.');
  const controller = new AbortController(); let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Inspection timed out.')); }, 6000); });
  try {
    const addresses = await Promise.race([resolve(host, { all: true }), timeout]);
    if (!addresses.length || addresses.some(row => !publicTargetAddress(row.address)) || controller.signal.aborted) throw new Error('Target address blocked.');
    const address = addresses[0].address;
    return await Promise.race([new Promise((resolve, reject) => {
      const outgoing = send(`https://${host}/`, { method: 'HEAD', agent: false, maxHeaderSize: 16384, signal: controller.signal,
        lookup: (_host, options, done) => options.all ? done(null, [{ address, family: isIP(address) }]) : done(null, address, isIP(address)),
        headers: { 'User-Agent': 'Ophanim-authorized-https-diagnostics/1.0', Accept: '*/*' } }, response => {
        const certificate = response.socket.getPeerCertificate?.() ?? {};
        const headers = Object.fromEntries(exposedHeaders.filter(name => typeof response.headers[name] === 'string')
          .map(name => [name, response.headers[name].slice(0, 2000)]));
        const tls = { authorized: response.socket.authorized === true, protocol: response.socket.getProtocol?.() ?? null,
          validFrom: certificate.valid_from ?? null, validTo: certificate.valid_to ?? null, fingerprint256: certificate.fingerprint256 ?? null };
        response.resume(); resolve({ httpStatus: response.statusCode ?? null, headers, tls });
      });
      outgoing.on('error', () => reject(new Error('HTTPS inspection unavailable.'))); outgoing.end();
    }), timeout]);
  } finally { clearTimeout(timer); controller.abort(); }
}

const digest = value => createHash('sha256').update(value).digest();
export function createReconServer({ token = '', targets = '', inspect = inspectHttps, now = Date.now } = {}) {
  const approved = new Set(approvedTargets(targets)); let active = 0, requests = 0, windowStart = now();
  return createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000 }, async (request, response) => {
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(body)); };
    if (token.length < 32 || /[\s\x00-\x1f\x7f]/.test(token) || !approved.size) return send(503, { error: 'Recon service is not configured.' });
    if (!timingSafeEqual(digest(request.headers.authorization ?? ''), digest(`Bearer ${token}`))) return send(401, { error: 'Authentication required.' });
    if (request.method === 'GET' && request.url === '/health') return send(200, { status: 'ready', mode: 'authorized-https-diagnostics', supportedModes: MODES, upstreamTested: false });
    const url = new URL(request.url, 'http://worker');
    const mode = url.pathname.replace(/^\/scan\//, '');
    if (request.method !== 'GET' || !url.pathname.startsWith('/scan/') || !MODES.includes(mode)) return send(404, { error: 'Inspection mode unavailable.' });
    const target = canonicalTarget(url.searchParams.get('target'));
    if (!target || !approved.has(target)) return send(403, { error: 'Target not approved by the operator.' });
    if (now() - windowStart >= 60000) { windowStart = now(); requests = 0; }
    if (++requests > 5 || active >= 2) return send(429, { error: 'Inspection limit reached.' });
    active++;
    try {
      const observation = await inspect(target);
      send(200, { target, mode, ...observation, observedAt: new Date(now()).toISOString(), risk: 'unknown',
        attribution: 'Direct HTTPS response from the operator-approved target; no content republication.',
        limitations: ['One HTTPS HEAD request on port 443; no port sweep, exploitation, vulnerability validation or subdomain enumeration.',
          'Missing headers do not establish a vulnerability. Redirect destinations are not requested. Cookies and response bodies are excluded.'] });
    } catch { send(502, { error: 'Inspection unavailable, blocked or timed out.' }); }
    finally { active--; }
  });
}
