import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sameOrigin } from './origin';
const request=(origin?:string,site?:string)=>new NextRequest('http://internal:3000/api/platform/integrations',{headers:{...(origin?{origin}:{}),...(site?{'sec-fetch-site':site}:{})}});
describe('canonical public origin behind an internal Next host',()=>{
  afterEach(()=>vi.unstubAllEnvs());
  it('accepts the configured public browser origin without trusting a proxy-normalized host',()=>{
    vi.stubEnv('APP_URL','https://ophanim.example');
    expect(sameOrigin(request('https://ophanim.example'))).toBe(true);
    for(const origin of ['https://attacker.invalid','http://ophanim.example','null','https://user:pass@ophanim.example'])expect(sameOrigin(request(origin))).toBe(false);
    expect(sameOrigin(request('https://ophanim.example','cross-site'))).toBe(false);
  });
  it('uses the request origin when no public origin is configured, preserving authenticated non-browser clients',()=>{
    vi.stubEnv('APP_URL',undefined);
    expect(sameOrigin(request('http://internal:3000'))).toBe(true);
    expect(sameOrigin(request())).toBe(true);
    expect(sameOrigin(request(undefined,'cross-site'))).toBe(false);
  });
  it('uses the original Host header when Next normalizes a local listener URL, including an empty env template',()=>{
    vi.stubEnv('APP_URL','');
    const local=(origin:string,host='127.0.0.1:3107')=>new NextRequest('http://localhost:3107/api/platform/integrations',{headers:{host,origin}});
    expect(sameOrigin(local('http://127.0.0.1:3107'))).toBe(true);
    expect(sameOrigin(local('http://attacker.invalid'))).toBe(false);
    expect(sameOrigin(local('http://attacker.invalid','user@attacker.invalid'))).toBe(false);
  });
});
