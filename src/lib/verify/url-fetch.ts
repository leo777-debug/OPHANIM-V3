import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { Parser } from 'htmlparser2';
import { validateHost, type ValidationResult } from '@/lib/ssrf-guard';
import { VERIFY_CONFIG } from './types';

export interface ArticleSnapshot { url: string; fetchedAt: string; text: string; sha256: string }
type Hop = { status: number; location?: string; contentType: string; body: string };
type Transport = (url: URL, address: string, signal: AbortSignal) => Promise<Hop>;

export const pinnedTransport: Transport = (url, address, signal) => new Promise((resolve, reject) => {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  // The socket uses the checked IP; the original hostname remains the TLS/Host identity.
  const req = send(url, { signal, agent: false, headers: { Accept: 'text/html, text/plain', 'Accept-Encoding': 'identity', 'User-Agent': 'OphanimVerify/1.0' },
    lookup: (_hostname, options, callback) => {
      const family = isIP(address);
      if (options.all) callback(null, [{ address, family }]);
      else callback(null, address, family);
    },
  }, (res) => {
    const status = res.statusCode ?? 500;
    const location = res.headers.location;
    const contentType = String(res.headers['content-type'] ?? '');
    if (status >= 300 && status < 400) { res.resume(); resolve({ status, location, contentType, body: '' }); return; }
    if (!/^(text\/(html|plain)|application\/json)\b/i.test(contentType) || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) {
      res.destroy(); reject(new Error('Only uncompressed HTML or plain text is accepted.')); return;
    }
    if (Number(res.headers['content-length'] ?? 0) > VERIFY_CONFIG.maxArticleBytes) { res.destroy(); reject(new Error('Article exceeds the size limit.')); return; }
    const chunks: Buffer[] = []; let size = 0;
    res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > VERIFY_CONFIG.maxArticleBytes) res.destroy(new Error('Article exceeds the size limit.')); else chunks.push(chunk); });
    res.on('end', () => resolve({ status, location, contentType, body: Buffer.concat(chunks).toString('utf8') }));
    res.on('error', reject);
  });
  req.on('error', reject); req.end();
});

export function extractArticleText(html: string): string {
  const chunks: string[] = []; const ignored = new Set(['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer']);
  let depth = 0;
  const parser = new Parser({ onopentag(name) { if (ignored.has(name)) depth++; },
    onclosetag(name) { if (ignored.has(name)) depth--; if (!depth) chunks.push(' '); },
    ontext(text) { if (!depth) chunks.push(text); },
  }, { decodeEntities: true });
  parser.write(html); parser.end();
  return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, VERIFY_CONFIG.maxArticleText);
}

export async function fetchArticle(input: string, dependencies: { validate?: (host: string) => Promise<ValidationResult>; transport?: Transport; json?: boolean } = {}): Promise<ArticleSnapshot> {
  if (input.length > VERIFY_CONFIG.maxUrlLength) throw new Error('URL is too long.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Article fetch timed out.')), VERIFY_CONFIG.urlTimeoutMs);
  try {
    let url = new URL(input);
    for (let hop = 0; hop <= VERIFY_CONFIG.maxRedirects; hop++) {
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Only public HTTP(S) URLs on standard ports are accepted.');
      const blocked = (process.env.VERIFY_BLOCKED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean);
      if (blocked.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error('This site is not permitted for article fetching.');
      // Validation covers every DNS answer, then pins one permitted address for this hop.
      const check = await Promise.race([(dependencies.validate ?? validateHost)(url.hostname), new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Article fetch timed out.')), { once: true }))]);
      if (!check.ok || !check.resolved?.length) throw new Error('URL resolves to a blocked or unavailable address.');
      for (const address of check.resolved) {
        const canonical = new URL(`http://${isIP(address) === 6 ? `[${address}]` : address}`).hostname;
        const literal = await validateHost(canonical);
        if (!literal.ok) throw new Error('DNS returned a reserved address.');
      }
      const result = await (dependencies.transport ?? pinnedTransport)(url, check.resolved[0], controller.signal);
      if (result.status >= 300 && result.status < 400) {
        if (!result.location || hop === VERIFY_CONFIG.maxRedirects) throw new Error('Too many or invalid redirects.');
        url = new URL(result.location, url); continue;
      }
      if (result.status < 200 || result.status >= 300) throw new Error(`Article returned HTTP ${result.status}.`);
      if (Buffer.byteLength(result.body) > VERIFY_CONFIG.maxArticleBytes) throw new Error('Article exceeds the size limit.');
      if (!dependencies.json && !/^text\/(html|plain)\b/i.test(result.contentType)) throw new Error('Only HTML or plain text articles are accepted.');
      const text = dependencies.json ? result.body : result.contentType.startsWith('text/html') ? extractArticleText(result.body) : result.body.trim().slice(0, VERIFY_CONFIG.maxArticleText);
      if (!text) throw new Error('No readable article text was returned.');
      return { url: url.toString(), text, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(text).digest('hex') };
    }
    throw new Error('Too many redirects.');
  } finally { clearTimeout(timeout); }
}
