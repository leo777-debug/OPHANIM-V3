import { afterEach, expect, it, vi } from 'vitest';
import { trustedRequestOrigin } from './request-origin';
afterEach(() => vi.unstubAllEnvs());
it('accepts the configured public origin behind an internal proxy URL', () => {
  vi.stubEnv('APP_URL', 'https://ophanim.example/');
  expect(trustedRequestOrigin(new Request('http://localhost:3100/api/verify/check', { headers: { Origin: 'https://ophanim.example' } }))).toBe(true);
});
it.each(['https://attacker.example', 'null', 'https://ophanim.example.attacker.test'])('rejects an unconfigured origin %s', (origin) => {
  vi.stubEnv('APP_URL', 'https://ophanim.example');
  expect(trustedRequestOrigin(new Request('http://localhost/api', { headers: { Origin: origin } }))).toBe(false);
});
it('rejects cross-site metadata even when the origin matches', () => {
  expect(trustedRequestOrigin(new Request('http://localhost/api', { headers: { Origin: 'http://localhost', 'sec-fetch-site': 'cross-site' } }))).toBe(false);
});
it('does not trust forwarded-origin headers or malformed configuration', () => {
  vi.stubEnv('APP_URL', 'not a URL');
  expect(trustedRequestOrigin(new Request('http://localhost/api', { headers: { Origin: 'https://attacker.example', 'x-forwarded-host': 'attacker.example' } }))).toBe(false);
});
