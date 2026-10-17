import { expect, it } from 'vitest';
import { providerError } from './provider-error';

it.each([
  [{ message: 'Monthly quota exceeded', code: 'insufficient_quota' }, 'quota or budget'],
  [{ error: { message: 'Tokens per minute exceeded' } }, 'token-rate'],
  [{ message: 'Service tier capacity exceeded' }, 'capacity limit'],
  [{ message: 'Too many requests' }, 'rate limit or quota'],
])('classifies provider rate limits without exposing upstream text', async (payload, expected) => {
  const error = await providerError(new Response(JSON.stringify(payload), { status: 429, headers: { 'Retry-After': '60' } }));
  expect(error.message).toContain(expected);
  expect(error.status).toBe(429);
  expect(error.retryAfterSeconds).toBe(60);
});
it('never echoes credentials or prompt contents from an error response', async () => {
  const error = await providerError(new Response('{"message":"secret-api-key private-prompt"}', { status: 429 }));
  expect(error.message).not.toMatch(/secret-api-key|private-prompt/);
});
it('handles non-JSON errors and rejects untrusted retry headers', async () => {
  const error = await providerError(new Response('gateway failure', { status: 429, headers: { 'Retry-After': 'invalid' } }));
  expect(error.retryAfterSeconds).toBeUndefined();
  expect(error.message).toContain('429');
});
it('limits the size of untrusted provider error bodies', async () => {
  const error = await providerError(new Response(JSON.stringify({ message: 'quota'.repeat(10000) }), { status: 429 }));
  expect(error.message).toContain('rate limit or quota');
  expect(error.message.length).toBeLessThan(250);
});
