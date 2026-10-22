import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createResearchEngine, createResearchServer } from '../../../ops/research/service.mjs';
import { researchInSandbox } from './sandbox-research';

let server: Server | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise<void>((resolve, reject) => { server!.close(error => error ? reject(error) : resolve()); server!.closeAllConnections(); });
  server = undefined;
});
it('connects the actual application adapter to the restricted worker without exposing context to upstream feeds', async () => {
  const token = 'synthetic-bridge-token-local-test-only';
  const fetcher = vi.fn(async (url: string) => ({ type: 'FeatureCollection', features: url.includes('earthquake') ? [
    { properties: { title: 'Earthquake near Dubai fixture', place: 'Dubai', time: 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/fixture' } },
  ] : [] }));
  const research = vi.fn(createResearchEngine({ fetcher, now: () => 10000 }));
  server = createResearchServer({ token, research });
  const paths: string[] = []; server.on('request', request => paths.push(request.url!));
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture server unavailable.');
  const origin = `http://127.0.0.1:${address.port}`;
  vi.stubEnv('AI_SANDBOX_RESEARCH_URL', origin); vi.stubEnv('AI_SANDBOX_RESEARCH_TOKEN', token);
  vi.stubEnv('INTEGRATION_ALLOWED_ORIGINS', origin);
  const result = await researchInSandbox({ subject: 'Dubai earthquake', purpose: 'assess_risk', context: 'Synthetic private shipment 123' });
  expect(paths).toEqual(['/health', '/v1/research']);
  expect(result).toMatchObject({ riskIndicator: 'unknown', collectedAt: '1970-01-01T00:00:10.000Z' });
  expect(result.sources[0]).toMatchObject({ publishedAt: '1970-01-01T00:00:01.000Z', attribution: expect.stringContaining('Geological Survey'), licence: expect.stringContaining('public domain') });
  expect(result.limitations.join(' ')).toContain('No AI inference');
  expect(research).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain('Synthetic private');
  expect(JSON.stringify(result)).not.toContain(token);
  vi.stubEnv('AI_SANDBOX_RESEARCH_TOKEN', 'wrong-synthetic-token');
  await expect(researchInSandbox({ subject: 'Dubai earthquake', purpose: 'confirm' })).rejects.toThrow('HTTP 401');
  expect(paths).toEqual(['/health', '/v1/research', '/health']);
  expect(research).toHaveBeenCalledTimes(1);
});
