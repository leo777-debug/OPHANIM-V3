import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScheduler, pollInterval, saveState, schedulerHealthy, workerConfiguration } from '../../../ops/health-worker.mjs';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
});
const config = (origin = 'http://ophanim:3000') => workerConfiguration({ HEALTH_CRON_SECRET: 'synthetic-dedicated-secret', APP_INTERNAL_URL: origin });

describe('isolated health scheduler', () => {
  it('keeps every timer finite and between five minutes and one day', () => {
    for (const value of [undefined, '', 'Infinity', '-Infinity', 'NaN', 'no', '-1', '0', '1']) expect(pollInterval(value)).toBe(300000);
    expect(pollInterval('600.5')).toBe(600500);
    for (const value of ['86401', '1e200']) expect(pollInterval(value)).toBe(86400000);
  });
  it('requires a dedicated valid secret and an origin without embedded private fields', () => {
    for (const secret of ['', 'line\nbreak', 'spaces not allowed']) expect(() => workerConfiguration({ HEALTH_CRON_SECRET: secret })).toThrow('secret');
    for (const origin of ['file:///tmp/a', 'http://user:private@ophanim', 'http://ophanim/path', 'http://ophanim?token=private', 'http://ophanim/#private', 'bad']) {
      expect(() => config(origin)).toThrow('invalid application origin');
    }
    expect(config().endpoint).toBe('http://ophanim:3000/api/platform/health/cron');
  });
  it('rejects absent, future, stale, failed and stuck heartbeats', () => {
    const state = { scope: 'scheduler', outcome: 'completed', lastSuccess: 1000000, lastAttempt: 1000000 };
    expect(schedulerHealthy(state, 300000, 1000001)).toBe(true);
    for (const value of [null, {}, { ...state, scope: 'feed' }, { ...state, lastSuccess: null }, { ...state, lastSuccess: '1000000' }, { ...state, outcome: 'failed' }]) expect(schedulerHealthy(value, 300000, 1000001)).toBe(false);
    expect(schedulerHealthy(state, 300000, 999999)).toBe(false);
    expect(schedulerHealthy(state, 300000, 1540001)).toBe(false);
    expect(schedulerHealthy({ ...state, outcome: 'running' }, 300000, 1240001)).toBe(false);
    expect(schedulerHealthy({ ...state, outcome: 'running' }, 300000, 1239999)).toBe(true);
  });
  it('does not overlap requests and sanitizes transport errors while retaining last success', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const persist = vi.fn(), log = vi.fn();
    const scheduler = createScheduler({ config: config(), fetcher, persist, log, now: () => 1000000 });
    const first = scheduler.check();
    expect(scheduler.check()).toBe(first); expect(fetcher).toHaveBeenCalledTimes(1);
    finish(new Response(null, { status: 200 })); await first;
    expect(persist).toHaveBeenLastCalledWith({ scope: 'scheduler', lastAttempt: 1000000, lastSuccess: 1000000, outcome: 'completed' });
    fetcher.mockRejectedValueOnce(new Error('private credentials and response body'));
    await scheduler.check();
    expect(persist).toHaveBeenLastCalledWith({ scope: 'scheduler', lastAttempt: 1000000, lastSuccess: 1000000, outcome: 'failed' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });
  it('executes the real HTTP contract and never equates feed failures with scheduler failure', async () => {
    const requests: { url: string | undefined; auth: string | undefined }[] = [];
    let status = 200;
    const server = createServer((request, response) => {
      requests.push({ url: request.url, auth: request.headers.authorization });
      response.writeHead(status, status === 302 ? { location: '/unexpected' } : {});
      response.end(JSON.stringify({ integrations: [{ id: 'usgs', status: 'Error' }], privateBody: 'must-not-persist' }));
    });
    servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture address');
    const persist = vi.fn(), log = vi.fn();
    const scheduler = createScheduler({ config: config(`http://127.0.0.1:${address.port}`), persist, log });
    await scheduler.check(); expect(persist.mock.lastCall?.[0].outcome).toBe('completed');
    for (status of [401, 500, 302]) { await scheduler.check(); expect(persist.mock.lastCall?.[0].outcome).toBe('failed'); }
    expect(requests).toHaveLength(4);
    expect(requests.every(item => item.url === '/api/platform/health/cron' && item.auth === 'Bearer synthetic-dedicated-secret')).toBe(true);
    expect(JSON.stringify(persist.mock.calls)).not.toMatch(/must-not-persist|synthetic-dedicated-secret/);
  });
  it('writes a complete atomic heartbeat without response data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ophanim-scheduler-'));
    try {
      const path = join(directory, 'health.json');
      const state = { scope: 'scheduler', outcome: 'completed', lastSuccess: 100, lastAttempt: 99 };
      saveState(state, path); expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(state);
      saveState({ ...state, outcome: 'failed' }, path); expect(JSON.parse(readFileSync(path, 'utf8')).outcome).toBe('failed');
    } finally { rmSync(directory, { recursive: true }); }
  });
  it('limits the Compose worker environment and checks health without sending another sweep', () => {
    const compose = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8');
    const worker = compose.split('  ophanim-health-monitor:')[1].split('\n  ophanim:')[0];
    expect(worker).not.toContain('env_file');
    expect([...worker.matchAll(/^      ([A-Z_]+):/gm)].map(match => match[1])).toEqual(['HEALTH_CRON_SECRET', 'HEALTH_POLL_SECONDS', 'APP_INTERNAL_URL']);
    expect(worker).toContain('--healthcheck'); expect(worker).toContain('read_only: true'); expect(worker).toContain('user: node');
  });
});
