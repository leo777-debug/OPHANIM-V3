import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { NextRequest } from 'next/server';
vi.mock('@/lib/ssrf-guard', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ssrf-guard')>(), isRateLimited: () => false, getClientIp: () => '192.0.2.1' }));
import { POST as connection } from '@/app/api/ai/connection/route';
import { POST as models } from '@/app/api/ai/models/route';

let server: Server;
let baseUrl: string;
let status = 200;
const received: Array<{ path: string; authorization: string | undefined; body: string }> = [];
const key = 'fixture-key-not-a-real-credential';
beforeAll(async () => {
  server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received.push({ path: request.url!, authorization: request.headers.authorization, body });
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(status !== 200 ? { message: 'rate limit exceeded' } : request.url === '/v1/models'
      ? { data: [{ id: 'fixture-chat', aliases: ['fixture-latest'], capabilities: { completion_chat: true } }, { id: 'fixture-embed', capabilities: { completion_chat: false } }, { id: key }] }
      : { choices: [{ message: { content: 'Connection successful.' } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server failed to bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
  vi.stubEnv('AI_LOCAL_BASE_URLS', baseUrl);
});
afterEach(() => { received.length = 0; status = 200; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); vi.unstubAllEnvs(); });
const request = (path: string, config: Record<string, unknown> = {}) => new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify({ apiKey: `  ${key}  `, baseUrl: `${baseUrl}/v1`, model: 'fixture-chat', ...config }) });

it('forwards the entered key and model through the real connection route to the HTTP wire', async () => {
  const response = await connection(request('/api/ai/connection'));
  expect(response.status).toBe(200);
  expect(received[0]).toMatchObject({ path: '/v1/chat/completions', authorization: `Bearer ${key}` });
  expect(JSON.parse(received[0].body)).toMatchObject({ model: 'fixture-chat', max_tokens: 64 });
  expect(await response.text()).not.toContain(key);
});
it('discovers chat models using the same entered key without a completion request or credential echo', async () => {
  const response = await models(request('/api/ai/models', { model: undefined }));
  expect(response.status).toBe(200);
  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({ path: '/v1/models', authorization: `Bearer ${key}`, body: '' });
  expect((await response.json()).models).toEqual(['fixture-chat', 'fixture-latest']);
});
it('normalizes a pasted full chat URL instead of duplicating its path', async () => {
  expect((await connection(request('/api/ai/connection', { baseUrl: `${baseUrl}/v1/chat/completions/` }))).status).toBe(200);
  expect(received[0].path).toBe('/v1/chat/completions');
});
it('does not pretend a rejected key or rate-limited provider is connected', async () => {
  status = 401;
  expect((await models(request('/api/ai/models'))).status).toBe(401);
  status = 429;
  expect((await connection(request('/api/ai/connection'))).status).toBe(429);
});
it('rejects an accidentally pasted Bearer prefix without sending a request', async () => {
  const response = await models(request('/api/ai/models', { apiKey: `Bearer ${key}` }));
  expect(response.status).toBe(400);
  expect(received).toHaveLength(0);
  expect(await response.text()).not.toContain(key);
});
it('rejects invisible characters without exposing the entered key in a header error', async () => {
  const response = await connection(request('/api/ai/connection', { apiKey: `${key}\u200b` }));
  expect(received).toHaveLength(0);
  const body = await response.text();
  expect(body).toContain('invalid character');
  expect(body).not.toContain(key);
});
