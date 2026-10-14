import { createRequire } from 'node:module';
import net from 'node:net';
import dns from 'node:dns/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const guard = require('../../STRESS_TEST/network-guard.cjs') as { install: () => () => void; isLoopback: (host: string) => boolean };
afterEach(() => vi.unstubAllEnvs());
describe('Stress runtime cannot send traffic to third-party providers', () => {
  it('requires an explicit isolated runtime', () => {
    vi.stubEnv('OPHANIM_STRESS_ISOLATED', '');
    expect(() => guard.install()).toThrow('explicit isolated');
  });
  it('uses offline fixtures or fails before any external fetch', async () => {
    vi.stubEnv('OPHANIM_STRESS_ISOLATED', '1');
    const undo = guard.install();
    try {
      expect((await (await fetch('https://earthquake.usgs.gov/fixture')).json()).features).toEqual([]);
      await expect(fetch('https://api.shodan.io/api-info')).rejects.toThrow('isolated');
      await expect(fetch('https://production.example.test')).rejects.toThrow('isolated');
      await expect(dns.lookup('provider.example.test')).rejects.toThrow('blocked external DNS');
      expect(() => new net.Socket().connect({ host: '8.8.8.8', port: 443 })).toThrow('blocked');
      expect(() => new net.Socket().connect({ host: 'provider.example.test', port: 443 })).toThrow('blocked');
    } finally { undo(); }
  });
  it('does not trust names containing localhost', () => {
    expect(guard.isLoopback('localhost.attacker.test')).toBe(false);
    expect(guard.isLoopback('127.0.0.1.attacker.test')).toBe(false);
    expect(guard.isLoopback('127.0.0.1')).toBe(true);
  });
});
