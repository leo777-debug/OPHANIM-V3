import { afterEach,describe,expect,it,vi } from 'vitest';
import { cronAuthorized } from './cron-auth';
afterEach(()=>vi.unstubAllEnvs());
describe('compatibility cron authorization',()=>{
 const request=(token:string)=>new Request('http://localhost/api/watchtower/health',{headers:{Authorization:token}});
 it('refuses blank configuration, wrong tokens and malformed byte lengths',()=>{
  vi.stubEnv('JOBFILE_CRON_SECRET','');expect(cronAuthorized(request('Bearer '),['JOBFILE_CRON_SECRET'])).toBe(false);
  vi.stubEnv('JOBFILE_CRON_SECRET','test-token');expect(cronAuthorized(request('Bearer nope'),['JOBFILE_CRON_SECRET'])).toBe(false);
  expect(cronAuthorized(request('Bearer ééééé'),['JOBFILE_CRON_SECRET'])).toBe(false);
 });
 it('accepts either existing configured camera cron identity',()=>{
  vi.stubEnv('JOBFILE_CRON_SECRET','job-test');vi.stubEnv('INTELLIGENCE_ALERT_CRON_SECRET','intelligence-test');
  expect(cronAuthorized(request('Bearer job-test'),['JOBFILE_CRON_SECRET','INTELLIGENCE_ALERT_CRON_SECRET'])).toBe(true);
  expect(cronAuthorized(request('Bearer intelligence-test'),['JOBFILE_CRON_SECRET','INTELLIGENCE_ALERT_CRON_SECRET'])).toBe(true);
 });
});
