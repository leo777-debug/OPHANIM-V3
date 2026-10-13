import { describe, expect, it, vi } from 'vitest';
import { extractArticleText, fetchArticle } from './url-fetch';
const allowed = vi.fn(async () => ({ ok: true, resolved: ['8.8.8.8'] }));
const transport = vi.fn(async () => ({ status: 200, contentType: 'text/html', body: '<article>Hello &amp; welcome<script>steal()</script><p>Actual text</p></article>' }));
describe('Verify pinned, bounded URL fetch', () => {
  it('extracts text without executing or including scripts/navigation', () => expect(extractArticleText('<nav>Menu</nav><p>Story &amp; data</p><script>alert(1)</script>')).toBe('Story & data'));
  it('passes a validated literal address to the socket transport', async () => {
    const value = await fetchArticle('https://example.com/story', { validate: allowed, transport });
    expect(value.text).toBe('Hello & welcome Actual text'); expect(value.sha256).toHaveLength(64);
    expect(transport).toHaveBeenCalledWith(expect.any(URL), '8.8.8.8', expect.any(AbortSignal));
  });
  it.each(['http://127.0.0.1', 'http://10.0.0.1', 'http://169.254.169.254', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://2130706433', 'http://localhost'])('blocks %s', async (url) => { await expect(fetchArticle(url, { transport })).rejects.toThrow(); });
  it.each(['file:///etc/passwd', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com:8080'])('rejects invalid protocol/credentials/port %s', async (url) => { await expect(fetchArticle(url, { validate: allowed, transport })).rejects.toThrow(); });
  it('checks every DNS address, including uncompressed IPv6 loopback', async () => {
    await expect(fetchArticle('https://example.com', { validate: async () => ({ ok: true, resolved: ['8.8.8.8', '0:0:0:0:0:0:0:1'] }), transport })).rejects.toThrow('reserved');
  });
  it('revalidates every redirect and blocks redirect to metadata', async () => {
    const send = vi.fn(async () => ({ status: 302, location: 'http://169.254.169.254/latest', contentType: 'text/html', body: '' }));
    const validate = vi.fn(async (host: string) => host === 'example.com' ? { ok: true, resolved: ['8.8.8.8'] } : { ok: false });
    await expect(fetchArticle('https://example.com', { validate, transport: send })).rejects.toThrow('blocked'); expect(send).toHaveBeenCalledTimes(1);
  });
  it('limits redirects, article size and content types', async () => {
    await expect(fetchArticle('https://example.com', { validate: allowed, transport: async () => ({ status: 302, location: '/loop', body: '', contentType: '' }) })).rejects.toThrow('redirect');
    await expect(fetchArticle('https://example.com', { validate: allowed, transport: async () => ({ status: 200, body: 'x'.repeat(1024 * 1024 + 1), contentType: 'text/plain' }) })).rejects.toThrow('size');
    await expect(fetchArticle('https://example.com', { validate: allowed, transport: async () => ({ status: 200, body: '{}', contentType: 'application/json' }) })).rejects.toThrow('plain text');
  });
  it('reports upstream failure and has a total DNS timeout', async () => {
    await expect(fetchArticle('https://example.com', { validate: allowed, transport: async () => ({ status: 500, body: '', contentType: 'text/plain' }) })).rejects.toThrow('500');
    vi.useFakeTimers(); const promise = fetchArticle('https://example.com', { validate: () => new Promise(() => {}), transport });
    const assertion = expect(promise).rejects.toThrow('timed out'); await vi.advanceTimersByTimeAsync(8001); await assertion; vi.useRealTimers();
  });
});
