import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanAllowlist, validateScanTargets } from './scan-guard';

afterEach(() => vi.unstubAllEnvs());
describe('Shodan scan containment', () => {
  it('allows owned IPs and fully-contained CIDRs', () => {
    expect(validateScanTargets('203.0.113.1,203.0.113.128/25', true, ['203.0.113.0/24'])).toEqual({ targets: ['203.0.113.1', '203.0.113.128/25'], hosts: 129 });
  });
  it('rejects a CIDR when only the first IP is allowed', () => {
    expect(() => validateScanTargets('203.0.113.0/24', true, ['203.0.113.0'])).toThrow('entire CIDR');
  });
  it('rejects mixed authorized and unauthorized requests as a whole', () => {
    expect(() => validateScanTargets('203.0.113.1,198.51.100.1', true, ['203.0.113.0/24'])).toThrow('entire CIDR');
  });
  it('supports IPv6 containment and rejects ranges outside the allowlist', () => {
    expect(validateScanTargets('2001:db8::1,2001:db8::100/120', true, ['2001:db8::/64'], 300).hosts).toBe(257);
    expect(() => validateScanTargets('2001:db8:1::1', true, ['2001:db8::/64'])).toThrow('entire CIDR');
  });
  it('handles IPv4-mapped IPv6 numerically instead of textual prefixes', () => {
    expect(validateScanTargets('::ffff:203.0.113.1', true, ['::ffff:203.0.113.0/120']).hosts).toBe(1);
    expect(() => validateScanTargets('::ffff:198.51.100.1', true, ['::ffff:203.0.113.0/120'])).toThrow();
  });
  it('supports unions of adjacent ranges but rejects a gap', () => {
    expect(validateScanTargets('203.0.113.0/24', true, ['203.0.113.0/25', '203.0.113.128/25']).hosts).toBe(256);
    expect(() => validateScanTargets('203.0.113.0/24', true, ['203.0.113.0/26', '203.0.113.128/25'])).toThrow();
  });
  it.each(['example.com', '203.0.113.1/33', '203.0.113.1/-1', '203.0.113.1/24/0', '203.0.113.999', '203.0.113.1,', '127.1', '2001:db8::1%eth0'])('rejects malformed target %s', (target) => {
    expect(() => validateScanTargets(target, true, ['203.0.113.0/24'])).toThrow();
  });
  it('fails closed without an allowlist or explicit boolean confirmation', () => {
    expect(() => validateScanTargets('203.0.113.1', true, [])).toThrow('disabled');
    expect(() => validateScanTargets('203.0.113.1', 'true', ['203.0.113.0/24'])).toThrow('Confirm');
  });
  it('caps large CIDRs and deduplicates identical targets', () => {
    expect(() => validateScanTargets('203.0.0.0/16', true, ['203.0.0.0/16'])).toThrow('limited to 256');
    expect(validateScanTargets('203.0.113.1,203.0.113.1', true, ['203.0.113.1']).hosts).toBe(1);
  });
  it('isolates organization-specific allowlists with no fallback', () => {
    vi.stubEnv('AUTHORIZED_SCAN_TARGETS', JSON.stringify({ first: ['203.0.113.1'], second: ['198.51.100.1'] }));
    expect(scanAllowlist('first')).toEqual(['203.0.113.1']);
    expect(scanAllowlist('third')).toEqual([]);
    vi.stubEnv('AUTHORIZED_SCAN_TARGETS', '{broken');
    expect(() => scanAllowlist('first')).toThrow('administrator');
  });
});
