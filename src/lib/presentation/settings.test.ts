import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({ db: () => ({ query: mocks.query }) }));

const row = {
  presentation_mode: true, presentation_default_view: 'map', presentation_replay: 'auto',
  presentation_verify_button: false, pin_required: false, revision: 1,
  updated_at: '2026-10-16T00:00:00Z',
};

beforeEach(() => {
  vi.resetModules();
  mocks.query.mockReset();
  vi.stubEnv('DATABASE_URL', 'postgresql://test.invalid/database');
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('allows a cold connection to finish instead of rejecting after 1.8 seconds', async () => {
  mocks.query.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ rows: [row] }), 3000)));
  const { readPresentationSettings } = await import('./settings');
  const result = readPresentationSettings(true);
  const assertion = expect(result).resolves.toMatchObject({ enabled: true, revision: 1 });
  await vi.advanceTimersByTimeAsync(3001);
  await assertion;
});

it('coalesces concurrent settings reads and does not reuse cached settings for a fresh read', async () => {
  mocks.query.mockResolvedValue({ rows: [row] });
  const { readPresentationSettings } = await import('./settings');
  await Promise.all([readPresentationSettings(true), readPresentationSettings(true)]);
  expect(mocks.query).toHaveBeenCalledTimes(1);
  mocks.query.mockResolvedValue({ rows: [{ ...row, presentation_mode: false, revision: 2 }] });
  expect(await readPresentationSettings(true)).toMatchObject({ enabled: false, revision: 2 });
});

it('bounds a hung query and lets the next request recover', async () => {
  mocks.query.mockImplementationOnce(() => new Promise(() => {}));
  const { readPresentationSettings } = await import('./settings');
  const result = readPresentationSettings(true);
  const assertion = expect(result).rejects.toThrow('Settings timed out.');
  await vi.advanceTimersByTimeAsync(10001);
  await assertion;
  mocks.query.mockResolvedValue({ rows: [row] });
  expect(await readPresentationSettings(true)).toMatchObject({ enabled: true });
});

it('never treats stale settings as a successful fresh read after a database failure', async () => {
  mocks.query.mockResolvedValueOnce({ rows: [row] }).mockRejectedValueOnce(new Error('Database unavailable'));
  const { readPresentationSettings } = await import('./settings');
  await readPresentationSettings(true);
  await expect(readPresentationSettings(true)).rejects.toThrow('Database unavailable');
});

it('switches to Map view when a cold settings read takes three seconds', async () => {
  mocks.query.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ rows: [row] }), 3000)));
  const { POST } = await import('@/app/api/presentation/view/route');
  const response = POST(new NextRequest('https://ophanim.example/api/presentation/view', {
    method: 'POST', headers: { origin: 'https://ophanim.example', 'content-type': 'application/json' },
    body: JSON.stringify({ view: 'map', returnTo: '/logistics/map' }),
  }));
  await vi.advanceTimersByTimeAsync(3001);
  const result = await response;
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ view: 'map', href: '/presentation?view=map' });
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
});
