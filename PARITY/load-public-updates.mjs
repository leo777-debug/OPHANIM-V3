// Bounded local HTTP stream check. This does not launch or benchmark browsers.
import { writeFile } from 'node:fs/promises';
const endpoint = new URL('/api/public-intelligence/stream', process.argv[2] || 'http://localhost:3107');
if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Local instance required.');
const started = Date.now();
const results = await Promise.all(Array.from({ length: 12 }, async () => {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 25000);
  let reader;
  try {
    const response = await fetch(endpoint, { signal: abort.signal });
    if (!response.ok) return { status: response.status, notified: false };
    reader = response.body.getReader(); const decoder = new TextDecoder(); let text = '';
    while (!text.includes('event: public-update')) {
      const chunk = await reader.read(); if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > 16000) throw new Error('Unexpected notification size.');
    }
    const line = text.split('\n').find(line => line.startsWith('data: '));
    const data = line ? JSON.parse(line.slice(6)) : null;
    return { status: response.status, notified: Boolean(data?.revision), revision: data?.revision, mode: data?.updateMode, intervalSeconds: data?.intervalSeconds,
      privateFieldDetected: /organizationId|apiKey|Authorization|shipment/i.test(text) };
  } catch (error) { return { notified: false, error: error.name === 'AbortError' ? 'timeout' : 'transport failed' }; }
  finally { clearTimeout(timer); abort.abort(); if (reader) await reader.cancel().catch(() => {}); }
}));
const report = { checkedAt: new Date().toISOString(), elapsedMs: Date.now() - started, connections: results.length, results,
  limitation: 'Twelve local HTTP clients, not twelve full browsers, not a multi-instance or throughput benchmark. One thousand listener fanout is separately unit tested. Source health can still fail independently.' };
await writeFile(new URL('./public-updates-load.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ connections: results.length, notified: results.filter(result => result.notified).length, elapsedMs: report.elapsedMs }));
if (results.some(result => !result.notified || result.privateFieldDetected)) process.exitCode = 1;
