import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/actor', () => ({ getAuthenticatedActor: vi.fn(async () => null) }));
vi.mock('@/lib/ai/config', () => ({
  parseAiConfig: vi.fn(() => null),
  getServerAiConfig: vi.fn(() => ({ apiKey: 'mock-only', baseUrl: 'https://model.test/v1', model: 'fixture', enabledTasks: ['explain'] })),
}));
vi.mock('@/lib/ai/local-model', () => ({ generateWithRouting: vi.fn(async () => ({ output: 'Fixture summary', model: 'fixture' })) }));
vi.mock('@/lib/ai/providers/openai-compatible-provider', () => ({ openAiCompatibleProvider: { generate: vi.fn() } }));
vi.mock('@/lib/ai-engine', () => ({ createGeminiClient: vi.fn(), rotateApiKey: vi.fn(), analyzeIntelligence: vi.fn(), generateBriefing: vi.fn() }));
import { POST as generate } from '@/app/api/ai/generate/route';
import { POST as analyze } from '@/app/api/ai/analyze/route';
import { POST as briefing } from '@/app/api/ai/briefing/route';
import { POST as overview } from '@/app/api/ai/overview/route';
import { POST as connection } from '@/app/api/ai/connection/route';
import { generateWithRouting } from './local-model';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { authorizeAiRequest } from './access';
import { POST as parseClaim } from '@/app/api/verify/parse/route';
import { POST as checkClaim } from '@/app/api/verify/check/route';

const actor = (userId: string) => ({ userId, organizationId: 'fixture-org', role: 'analyst' as const, email: '', displayName: null, authProvider: 'legacy' as const });
const request = (name: string, body: unknown = {}, headers: Record<string, string> = {}) => new NextRequest(`http://localhost/api/${name}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

describe('AI endpoints authenticate before touching model credentials', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAuthenticatedActor).mockResolvedValue(null); });
  it.each([['generate', generate], ['analyze', analyze], ['briefing', briefing], ['overview', overview], ['connection', connection]] as const)(
    '%s rejects an anonymous request before a model call', async (name, handler) => {
      const response = await handler(new NextRequest(`http://localhost/api/ai/${name}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task: 'explain', input: 'A fixture', context: {}, mode: 'alerts', payload: {} }),
      }));
      expect(response.status).toBe(401);
      expect(generateWithRouting).not.toHaveBeenCalled();
    },
  );
  it('allows signed-in generation through the existing configured model', async () => {
    vi.mocked(getAuthenticatedActor).mockResolvedValue(actor('generation-user'));
    const response = await generate(request('ai/generate', { task: 'explain', input: 'Fixture' }));
    expect(response.status).toBe(200);
    expect(generateWithRouting).toHaveBeenCalledOnce();
  });
  it.each(['origin', 'sec-fetch-site'])('rejects cross-site requests using %s before session/provider access', async (header) => {
    const response = await authorizeAiRequest(request('ai/generate', {}, { [header]: header === 'origin' ? 'https://attacker.test' : 'cross-site' }));
    expect(response?.status).toBe(403);
    expect(getAuthenticatedActor).not.toHaveBeenCalled();
    expect(generateWithRouting).not.toHaveBeenCalled();
  });
  it('enforces a shared user limit despite changing addresses and routes', async () => {
    vi.mocked(getAuthenticatedActor).mockResolvedValue(actor('changing-ip-user'));
    for (let n = 0; n < 10; n++) {
      expect(await authorizeAiRequest(request(`ai/${n % 2 ? 'generate' : 'overview'}`, {}, { 'x-real-ip': `fixture-ip-${n}` }))).toBeNull();
    }
    expect((await authorizeAiRequest(request('ai/connection', {}, { 'x-real-ip': 'another-address' })))?.status).toBe(429);
  });
  it('does not disclose session/database errors to the client', async () => {
    vi.mocked(getAuthenticatedActor).mockRejectedValueOnce(new Error('mock-private-connection-details'));
    const response = await authorizeAiRequest(request('ai/generate'));
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('mock-private');
  });
  it.each([['parse', parseClaim], ['check', checkClaim]] as const)('Verify %s refuses optional AI for anonymous users', async (name, handler) => {
    const response = await handler(request(`verify/${name}`, { useAi: true, text: 'Earthquake in Tokyo', confirmed: true }));
    expect(response.status).toBe(401);
    expect(generateWithRouting).not.toHaveBeenCalled();
  });
  it('keeps deterministic public Verify parsing available without AI', async () => {
    const response = await parseClaim(request('verify/parse', { text: 'Earthquake in Tokyo', useAi: false }));
    expect(response.status).toBe(200);
    expect((await response.json()).parser).toBe('rules');
    expect(generateWithRouting).not.toHaveBeenCalled();
  });
});
