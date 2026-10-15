import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ validate: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/ssrf-guard', () => ({ validateHost: mocks.validate }));
vi.mock('node:http', () => ({ request: mocks.send }));
vi.mock('node:https', () => ({ request: mocks.send }));
import { pinnedPublicFetch } from './pinned-public-fetch';

describe('pinned public endpoint transport', () => {
  beforeEach(() => {
    mocks.validate.mockResolvedValue({ ok: true, resolved: ['8.8.8.8'] });
    mocks.send.mockImplementation((_url, _options, receive) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: object; destroy: () => void };
        Object.assign(res, { statusCode: 200, headers: { 'content-type': 'application/json' }, destroy: () => {} });
        receive(res);
        queueMicrotask(() => { res.emit('data', Buffer.from('{"ok":true}')); res.emit('end'); });
      };
      return req;
    });
  });
  afterEach(() => vi.resetAllMocks());
  it('pins the checked IP without performing a second DNS lookup', async () => {
    expect(await (await pinnedPublicFetch('https://example.com')).json()).toEqual({ ok: true });
    const [url, options] = mocks.send.mock.calls[0];
    expect(url.hostname).toBe('example.com');
    const callback = vi.fn(); options.lookup('example.com', { all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(mocks.validate.mock.calls.map(([host]) => host)).toEqual(['example.com', '8.8.8.8']);
    expect(options.agent).toBe(false);
  });
  it('rejects mixed DNS answers before any connection', async () => {
    mocks.validate.mockResolvedValueOnce({ ok: true, resolved: ['8.8.8.8', '127.0.0.1'] })
      .mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    await expect(pinnedPublicFetch('https://example.com')).rejects.toThrow('reserved');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['file:///secret', 'https://user:pass@example.com'])('rejects endpoint %s before DNS', async (url) => {
    await expect(pinnedPublicFetch(url)).rejects.toThrow('HTTP(S)');
    expect(mocks.validate).not.toHaveBeenCalled();
  });
  it('enforces HTTPS-only webhook destinations', async () => {
    await expect(pinnedPublicFetch('http://example.com', { httpsOnly: true })).rejects.toThrow('HTTP(S)');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rejects redirects rather than forwarding credentials to a new host', async () => {
    mocks.send.mockImplementation((_url, _options, receive) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => receive({ statusCode: 302, headers: { location: 'http://127.0.0.1' }, resume: vi.fn() });
      return req;
    });
    await expect(pinnedPublicFetch('https://example.com')).rejects.toThrow('redirects');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('bounds the response body', async () => {
    mocks.send.mockImplementation((_url, _options, receive) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => receive({ statusCode: 200, headers: { 'content-length': '100' }, destroy: vi.fn() });
      return req;
    });
    await expect(pinnedPublicFetch('https://example.com', { maxResponseBytes: 10 })).rejects.toThrow('size');
  });
  it('preserves HEAD headers without treating the advertised resource size as a body', async () => {
    mocks.send.mockImplementation((_url, _options, receive) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: object };
        Object.assign(res, { statusCode: 200, headers: { 'content-length': '100000000', server: 'synthetic-server' } });
        receive(res); queueMicrotask(() => res.emit('end'));
      };
      return req;
    });
    const response = await pinnedPublicFetch('https://example.com', { method: 'HEAD', maxResponseBytes: 10 });
    expect(response.headers.get('server')).toBe('synthetic-server');
    expect(await response.text()).toBe('');
  });
});
