import { describe, expect, it } from 'vitest';
import { securityHeaders } from './security-headers';
describe('production browser security policy', () => {
  it('disallows eval, arbitrary remote scripts, objects, foreign forms and base URL changes', () => {
    const headers=securityHeaders(true);
    const policy=headers.find((header)=>header.key==='Content-Security-Policy')!.value;
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy.match(/script-src[^;]+/)![0]).not.toMatch(/\shttps:\s/);
  });
  it('keeps development eval separate from production and protects referrers/device access', () => {
    expect(securityHeaders(false)[0].value).toContain('unsafe-eval');
    expect(securityHeaders(true)).toContainEqual({key:'Referrer-Policy',value:'strict-origin-when-cross-origin'});
    expect(securityHeaders(true)).toContainEqual({key:'Permissions-Policy',value:'camera=(), microphone=(), payment=()'});
  });
});
