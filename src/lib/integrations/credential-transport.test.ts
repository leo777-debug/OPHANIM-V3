import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { INTEGRATIONS } from './catalog';
import { connectionProbe, requestIntegration } from './probes';

let server: Server;
let origin: string;
const received: Array<{ path?: string; authorization?: string }> = [];
beforeAll(async () => {
  server = createServer((request, response) => {
    received.push({ path: request.url, authorization: request.headers.authorization });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"data":[{"id":"fixture-model"}]}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server unavailable.');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

it('sends only the selected provider credential over the real pinned transport', async () => {
  const env = { INTEGRATION_ALLOWED_ORIGINS: origin,
    AI_BASE_URL: `${origin}/hosted/v1/chat/completions/`, AI_API_KEY: 'synthetic-hosted-credential',
    EMBEDDING_BASE_URL: `${origin}/vectors/v1/`, EMBEDDING_API_KEY: 'synthetic-vector-credential',
    OPHANIM_LOCAL_BASE_URL: `${origin}/local/v1/` };
  for (const id of ['local-model', 'embeddings', 'ai']) {
    const probe = connectionProbe(INTEGRATIONS.find(service => service.id === id)!, env);
    if (!probe) throw new Error('Missing fixture adapter.');
    await requestIntegration(probe, env);
  }
  expect(received).toEqual([
    { path: '/local/v1/models', authorization: undefined },
    { path: '/vectors/v1/models', authorization: 'Bearer synthetic-vector-credential' },
    { path: '/hosted/v1/models', authorization: 'Bearer synthetic-hosted-credential' },
  ]);
});
