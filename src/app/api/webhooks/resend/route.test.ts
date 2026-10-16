import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),release:vi.fn(),connect:vi.fn()}));
vi.mock('@/lib/watchlists/db',()=>({db:()=>({query:mocks.query,connect:mocks.connect})}));
import { POST } from './route';
const bytes=Buffer.from('synthetic-webhook-test-only');
const secret=`whsec_${bytes.toString('base64')}`;
const raw=JSON.stringify({type:'email.bounced',created_at:'2026-10-15T00:00:00Z',data:{email_id:'synthetic-email-id',to:['synthetic@example.test']}});
function request(payload=raw,age=0,signature=true){
  const id='synthetic-webhook-id',timestamp=String(Math.floor(Date.now()/1000)-age);
  return new NextRequest('http://localhost/api/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':timestamp,...(signature?{'svix-signature':`v1,${createHmac('sha256',bytes).update(`${id}.${timestamp}.${raw}`).digest('base64')}`}:{})},body:payload});
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('RESEND_WEBHOOK_SECRET',secret);mocks.connect.mockResolvedValue({query:mocks.query,release:mocks.release});mocks.query.mockResolvedValue({rowCount:1,rows:[]});});
afterEach(()=>vi.unstubAllEnvs());
describe('Resend webhook verification',()=>{
  it('rejects unsigned unsubscribe events before accessing storage',async()=>{
    expect((await POST(request(raw,0,false))).status).toBe(401);expect(mocks.query).not.toHaveBeenCalled();
  });
  it('fails closed when the signing secret is not configured',async()=>{
    vi.stubEnv('RESEND_WEBHOOK_SECRET','');expect((await POST(request())).status).toBe(503);expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([[raw+' ',0],[raw,600]])('rejects modified raw payload and expired signatures',async(payload,age)=>{
    expect((await POST(request(payload as string,age as number))).status).toBe(401);expect(mocks.query).not.toHaveBeenCalled();
  });
  it('accepts a correctly signed event atomically and uses SQL parameters',async()=>{
    expect((await POST(request())).status).toBe(200);
    expect(mocks.query.mock.calls[0][0]).toBe('begin');
    const insert=mocks.query.mock.calls.find(([sql])=>String(sql).includes('insert into ophanim_delivery_events'));
    expect(insert?.[1]?.[0]).toBe('synthetic-webhook-id');
    expect(mocks.query.mock.calls.some(([sql,values])=>String(sql).includes('enabled=false') && values[0]==='synthetic@example.test')).toBe(true);
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe('commit');
  });
  it('caps body size before verification or storage',async()=>{
    expect((await POST(request('x'.repeat(300000)))).status).toBe(413);expect(mocks.query).not.toHaveBeenCalled();
  });
  it('returns a safe retryable response if the database cannot connect',async()=>{
    mocks.connect.mockRejectedValueOnce(new Error('synthetic-private-database-credential'));
    const response=await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic-private');
  });
  it('does not repeat subscription side effects for a duplicate signed event',async()=>{
    mocks.query.mockImplementation(async(sql:string)=>({rowCount:sql.includes('insert into')?0:1,rows:[]}));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes('enabled=false'))).toBe(false);
  });
});
