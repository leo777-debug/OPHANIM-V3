import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server, ClientRequest } from 'node:http';
import type { RequestOptions } from 'node:https';
import { EventEmitter } from 'node:events';
import { createReconServer, inspectHttps } from '../../../ops/recon/service.mjs';
import { approvedTargets, canonicalTarget } from '../../../ops/recon/targets.mjs';
import { scannerConfiguration, scannerInput, inspectApprovedTarget } from './scanner';
const servers: Server[] = [];
const token = 'synthetic-dedicated-recon-token-for-tests';
const organizationId = '11111111-1111-4111-8111-111111111111';
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
});
async function start(options: Parameters<typeof createReconServer>[0]) {
  const server = createReconServer(options); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture failed');
  return `http://127.0.0.1:${address.port}`;
}
describe('restricted approved-host diagnostics', () => {
  it('never treats wildcards, URLs or malformed entries as authorization', () => {
    for (const target of ['', 'localhost', 'https://approved.example', 'approved.example:443', 'user@approved.example', '*.example', '2130706433', '127.000.000.001', 'foo..example', 'approved.example/path']) expect(canonicalTarget(target)).toBeNull();
    expect(canonicalTarget('APPROVED.Example')).toBe('approved.example');
    expect(approvedTargets('approved.example,approved.example')).toEqual(['approved.example']);
    expect(approvedTargets('approved.example,*.example')).toEqual([]);
    expect(approvedTargets(Array.from({ length: 101 }, (_, i) => `host${i}.example`).join(','))).toEqual([]);
    expect(scannerInput({ target: 'approved.example', type: 'headers', url: 'private' })).toBeNull();
    expect(scannerConfiguration({ SCANNER_URL: 'https://user:secret@worker.example', SCANNER_KEY: token,
      SCANNER_ORGANIZATION_ID: organizationId, SCANNER_ALLOWED_TARGETS: 'approved.example' })).toBeNull();
  });
  it('blocks private/mixed DNS and late errors before creating a socket', async () => {
    const send = vi.fn();
    for (const answers of [[{ address: '127.0.0.1' }], [{ address: '8.8.8.8' }, { address: '169.254.169.254' }], [{ address: '::ffff:8.8.8.8' }], [{address:'2002:0808:0808::1'}], [{address:'2001::1'}], [{address:'3fff::1'}], []]) {
      await expect(inspectHttps('approved.example', { resolve: async () => answers, send })).rejects.toThrow('blocked');
    }
    expect(send).not.toHaveBeenCalled();
    await expect(inspectHttps('https://approved.example', { send })).rejects.toThrow('Invalid target');
  });
  it('pins the approved DNS answer, sends no credentials and withholds cookies on redirects', async () => {
    const send = vi.fn((...args: unknown[]) => {
      const callback = args[2] as (response: unknown) => void;
      const outgoing = new EventEmitter() as ClientRequest;
      outgoing.end = vi.fn(() => { queueMicrotask(() => callback({statusCode:302,headers:{server:'fixture','set-cookie':'private-cookie',location:'https://unapproved.example'},
        socket:{authorized:true,getPeerCertificate:()=>({valid_from:'date',raw:'private-certificate'}),getProtocol:()=> 'TLSv1.3'},resume:()=>{}})); return outgoing; });
      return outgoing;
    });
    const observation = await inspectHttps('approved.example', {resolve: async () => [{address:'8.8.8.8'}],send:send as unknown as typeof import('node:https').request});
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('https://approved.example/');
    const options=send.mock.calls[0][1] as RequestOptions;
    expect(options.method).toBe('HEAD'); expect(options.agent).toBe(false);
    expect(options.headers).not.toHaveProperty('Authorization');
    const pinned=vi.fn();
    options.lookup!('approved.example',{all:true},pinned);
    expect(pinned).toHaveBeenCalledWith(null,[{address:'8.8.8.8',family:4}]);
    expect(JSON.stringify(observation)).not.toMatch(/private-cookie|private-certificate|unapproved/);
  });
  it('keeps health authenticated and independent from target execution', async () => {
    const inspect = vi.fn();
    const origin = await start({ token, targets: 'approved.example', inspect });
    expect((await fetch(origin + '/health')).status).toBe(401);
    const health = await fetch(origin + '/health', { headers: { Authorization: `Bearer ${token}` } });
    expect(await health.json()).toMatchObject({ status: 'ready', upstreamTested: false, supportedModes: ['quick', 'headers', 'ssl', 'tech'] });
    const unavailable = await start({ token: '', targets: 'approved.example', inspect });
    expect((await fetch(unavailable + '/health')).status).toBe(503);
    expect(inspect).not.toHaveBeenCalled();
  });
  it('bridges actual app transport and worker HTTP without forwarding credentials to targets or arbitrary fields to the UI', async () => {
    const inspect = vi.fn(async () => ({ httpStatus: 302, observedAt: 'ignored', headers: { server: 'fixture', 'set-cookie': 'private-session' },
      tls: { authorized: true, protocol: 'TLSv1.3', raw: 'private-certificate' }, privateBody: 'private-worker-value' }));
    const origin = await start({ token, targets: 'approved.example', inspect });
    vi.stubEnv('INTEGRATION_ALLOWED_ORIGINS', origin);
    const config = scannerConfiguration({ SCANNER_URL: origin, SCANNER_KEY: token, SCANNER_ORGANIZATION_ID: organizationId, SCANNER_ALLOWED_TARGETS: 'approved.example' });
    expect(config).not.toBeNull();
    const result = await inspectApprovedTarget(config!, { target: 'approved.example', mode: 'headers' });
    expect(inspect).toHaveBeenCalledWith('approved.example'); expect(inspect.mock.calls[0]).toHaveLength(1);
    expect(result).toMatchObject({ httpStatus: 302, risk: 'unknown', headers: { server: 'fixture' }, tls: { authorized: true } });
    expect(JSON.stringify(result)).not.toMatch(/private-|synthetic-dedicated/);
    const headers = { Authorization: `Bearer ${token}` };
    expect((await fetch(origin + '/scan/headers?target=unapproved.example', { headers })).status).toBe(403);
    expect((await fetch(origin + '/scan/vuln?target=approved.example', { headers })).status).toBe(404);
    expect(inspect).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) await fetch(origin + '/scan/ssl?target=approved.example', { headers });
    expect((await fetch(origin + '/scan/ssl?target=approved.example', { headers })).status).toBe(429);
  });
  it('rejects a third concurrent inspection before invoking target transport', async () => {
    const releases: Array<() => void> = [];
    const inspect = vi.fn(() => new Promise(resolve => releases.push(() => resolve({httpStatus:200,headers:{},tls:{}}))));
    const origin = await start({token, targets:'approved.example', inspect});
    const init = {headers:{Authorization:`Bearer ${token}`}};
    const first = fetch(origin+'/scan/headers?target=approved.example', init);
    const second = fetch(origin+'/scan/ssl?target=approved.example', init);
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(2));
    expect((await fetch(origin+'/scan/quick?target=approved.example', init)).status).toBe(429);
    releases.forEach(release => release()); await Promise.all([first,second]);
    expect(inspect).toHaveBeenCalledTimes(2);
  });
  it('sanitizes target failures over HTTP', async () => {
    const origin = await start({ token, targets: 'approved.example', inspect: async () => { throw new Error('private-target-response'); } });
    const response = await fetch(origin + '/scan/headers?target=approved.example', { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(502); expect(await response.text()).not.toContain('private-target');
  });
});
