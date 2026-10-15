import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { OrganizationAccessError } from '@/lib/operations/authorization';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/actor', () => ({
  getAuthenticatedActor: vi.fn(async () => null),
  requireAuthenticatedActor: vi.fn(async () => { throw new OrganizationAccessError('Authentication is required.'); }),
}));

function routes(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(folder, entry.name);
    return entry.isDirectory() ? routes(file) : entry.name === 'route.ts' ? [file] : [];
  });
}
const root = resolve('src/app/api');
const cases = routes(root).flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  const name = file.slice(root.length).replaceAll('\\', '/').replace(/\/route\.ts$/, '') || '/';
  // Geographic/provider search is intentionally public; its Shodan-only policy
  // has dedicated tests in api/search/route.test.ts.
  if (name === '/search') return [];
  if (name !== '/extension/context' && !/await\s+(requireAuthenticatedActor|authorizeAiRequest)\s*\(/.test(source)) return [];
  return [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].filter((match)=>!(name==='/sdk/ingest' && match[1]==='POST')).map((match) => ({
    file, method: match[1], name,
  }));
});
const fetchSpy = vi.fn(async () => { throw new Error('Authentication tests must not call external providers.'); });
vi.stubGlobal('fetch', fetchSpy);
afterAll(() => vi.unstubAllGlobals());

describe('protected API handlers reject unauthenticated requests', () => {
  it.each(cases)('$method $name rejects before accessing provider data', async ({ file, method, name }) => {
    const handlers = await import(file.replaceAll('\\', '/')) as Record<string, (request: NextRequest, context: unknown) => Promise<Response>>;
    const url = `http://localhost/api${name.replaceAll(/\[[^\]]+\]/g, '11111111-1111-4111-8111-111111111111')}`;
    const request = new NextRequest(url, {
      method, ...(method === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: name.startsWith('/verify/') ? JSON.stringify({ useAi: true, text: 'Earthquake in Tokyo' }) : '{}' }),
    });
    const response = await handlers[method](request, { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111', type: 'shipment' }) });
    expect([401, 403], `${method} ${name} returned ${response.status}`).toContain(response.status);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
