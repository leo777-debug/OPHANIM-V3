import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as signup } from '@/app/api/public/signup/route';
import { POST as feedback } from '@/app/api/public/feedback/route';

let requestNumber = 0;
const fetchMock = vi.fn();
const request = (body: unknown) => new Request('https://landing.example/api/public/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `192.0.2.${++requestNumber}` },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubEnv('SUPABASE_URL', 'https://project.example');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_fixture');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('landing submissions', () => {
  it('saves an access request with normalized fields using the public insert permissions', async () => {
    const response = await signup(request({ name: ' Test Person ', email: 'TEST@example.invalid', phone: '+0000000000', companyName: '' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.example/rest/v1/ophanim_access_requests');
    expect(options.headers.apikey).toBe('sb_publishable_test_fixture');
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual({ name: 'Test Person', email: 'test@example.invalid', phone: '+0000000000', company_name: null, source: 'landing_page' });
  });

  it('allows feedback without optional contact details', async () => {
    const response = await feedback(request({ message: 'Please add route comparisons.' }));
    expect(response.status).toBe(201);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ name: null, email: null, message: 'Please add route comparisons.' });
  });

  it.each(['{', 'null', '[]'])('rejects malformed or non-object input: %s', async body => {
    expect((await signup(request(body))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds the actual request size when Content-Length is absent', async () => {
    const response = await feedback(request({ message: 'x'.repeat(17_000) }));
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not report success when storage rejects a submission or expose its response', async () => {
    fetchMock.mockResolvedValue(new Response('private database error with submitted contact data', { status: 403 }));
    const response = await feedback(request({ message: 'A valid feedback message.' }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database');
    expect(console.error).toHaveBeenCalledWith('Marketing submission storage failed', { table: 'ophanim_feedback', status: 403 });
  });

  it('returns an actionable unavailable response when environment configuration is missing', async () => {
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '');
    const response = await feedback(request({ message: 'A valid feedback message.' }));
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles an upstream timeout without claiming a saved submission', async () => {
    fetchMock.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    const response = await feedback(request({ message: 'A valid feedback message.' }));
    expect(response.status).toBe(503);
    expect((await response.json()).ok).toBeUndefined();
  });

  it('does not send honeypot submissions to the database', async () => {
    const response = await signup(request({ website: 'bot.example' }));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects too-short feedback before storage', async () => {
    expect((await feedback(request({ message: 'a' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
