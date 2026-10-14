import { describe, expect, it, vi } from 'vitest';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
import { validateHost } from './ssrf-guard';

describe('SSRF address normalization', () => {
  it.each(['0:0:0:0:0:0:0:1', '0000:0000:0000:0000:0000:ffff:7f00:0001', '0:0:0:0:0:0:0:0', 'fc00:0:0:0:0:0:0:1', 'fe80:0:0:0:0:0:0:1', '169.254.169.254', '127.0.0.1'])('blocks reserved literal %s', async (address) => {
    expect((await validateHost(address)).ok).toBe(false);
  });
  it('rejects an uncompressed loopback answer in a public hostname DNS result', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '0:0:0:0:0:0:0:1', family: 6 }] as never);
    expect((await validateHost('example.com')).ok).toBe(false);
  });
  it('permits public literals without network access', async () => {
    expect(await validateHost('8.8.8.8')).toEqual({ ok: true, resolved: ['8.8.8.8'] });
  });
});
