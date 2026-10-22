import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ validate: vi.fn(), dns: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/ssrf-guard', () => ({ validateHost: mocks.validate }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.dns }));
vi.mock('node:https', () => ({ request: mocks.send }));
vi.mock('node:http', () => ({ request: mocks.send }));
import { requestIntegration } from './probes';

function response(status: number, chunks = ['{}']) {
  mocks.send.mockImplementation((_url, options, callback) => {
    const request = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: () => void };
    request.write = vi.fn(); request.end = () => {
      const incoming = new EventEmitter() as EventEmitter & { statusCode: number; resume: ReturnType<typeof vi.fn>; destroy: (error: Error) => void };
      incoming.statusCode = status; incoming.resume = vi.fn(); incoming.destroy = error => incoming.emit('error', error);
      callback(incoming);
      for (const chunk of chunks) incoming.emit('data', Buffer.from(chunk));
      incoming.emit('end');
    };
    options.signal.addEventListener('abort', () => request.emit('error', new Error('aborted')), { once: true });
    return request;
  });
}
beforeEach(() => { vi.resetAllMocks(); mocks.validate.mockResolvedValue({ ok: true, resolved: ['8.8.8.8'] }); response(200); });
afterEach(() => { vi.useRealTimers(); });

describe('integration transport boundaries', () => {
  it('pins a validated public address and rejects redirects without forwarding credentials', async () => {
    await expect(requestIntegration({ url: 'https://service.example/models', expected: 'json' }, {})).resolves.toBe('{}');
    const options = mocks.send.mock.calls[0][1], callback = vi.fn();
    options.lookup('service.example', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);
    response(302);
    await expect(requestIntegration({ url: 'https://service.example/models', headers: { Authorization: 'Bearer fixture-only' } }, {})).rejects.toThrow('HTTP 302');
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it('ends a stalled DNS check within the total budget and never sends a late request', async () => {
    vi.useFakeTimers(); let answer!: (value: unknown) => void;
    mocks.validate.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const pending = expect(requestIntegration({ url: 'https://service.example' }, {}, 100)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100); await pending;
    answer({ ok: true, resolved: ['8.8.8.8'] }); await Promise.resolve();
    expect(mocks.send).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('requires an exact trusted HTTP origin, pins its DNS and rejects metadata answers', async () => {
    const url = 'http://sandbox:8080/health', env = { INTEGRATION_ALLOWED_ORIGINS: 'http://sandbox:8080' };
    await expect(requestIntegration({ url }, {})).rejects.toThrow('HTTP requires');
    mocks.dns.mockResolvedValue([{ address: '10.20.0.2', family: 4 }]);
    await requestIntegration({ url }, env);
    const callback = vi.fn(); mocks.send.mock.calls[0][1].lookup('sandbox', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '10.20.0.2', 4);
    mocks.dns.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(requestIntegration({ url }, env)).rejects.toThrow('Forbidden');
    mocks.dns.mockResolvedValue([{ address: '::ffff:a9fe:a9fe', family: 6 }]);
    await expect(requestIntegration({ url }, env)).rejects.toThrow('Forbidden');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('bounds response size and validates JSON without exposing provider payloads', async () => {
    response(200, ['not-json-fixture']);
    await expect(requestIntegration({ url: 'https://service.example', expected: 'json' }, {})).rejects.toThrow('invalid JSON');
    response(200, ['x'.repeat(2000001)]);
    await expect(requestIntegration({ url: 'https://service.example' }, {})).rejects.toThrow('Connection interrupted');
  });
});
