import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),send:vi.fn()}));
vi.mock('./db',()=>({db:()=>({query:mocks.query})}));
vi.mock('./service',()=>({notificationLinks:()=>({sources:[],watchlist:'https://example.test/watch',entity:'https://example.test/entity',map:'https://example.test/map'})}));
vi.mock('resend',()=>({Resend:class {emails={send:mocks.send};}}));
import { sendPendingNotifications } from './email';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('RESEND_API_KEY','synthetic-mail-fixture-only');vi.stubEnv('RESEND_FROM','demo@example.test');mocks.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('select')?[{id:'synthetic-notification',email:'demo@example.test',entity_value:'Synthetic fixture',payload:{},attempts:0}]:[]}));});
afterEach(()=>vi.unstubAllEnvs());
it('never stores raw provider errors in notification delivery logs',async()=>{
  mocks.send.mockRejectedValueOnce(new Error('synthetic-private-provider-credential'));
  expect(await sendPendingNotifications()).toEqual({sent:0,skipped:false});
  const update=mocks.query.mock.calls.find(([sql])=>String(sql).includes('error=$4'));
  expect(update).toBeDefined();expect(JSON.stringify(update)).not.toContain('synthetic-private');
});
