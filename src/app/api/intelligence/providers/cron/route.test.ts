import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({ingest:vi.fn(),ids:vi.fn(()=>['usgs-earthquakes'])}));
vi.mock('@/lib/intelligence/provider-ingestion',()=>({ingestIntelligenceEvents:mocks.ingest,publicIntelligenceProviderIds:mocks.ids}));
import { GET } from './route';
const call=(authorization?:string)=>GET(new NextRequest('http://localhost/api/intelligence/providers/cron',{headers:authorization?{authorization}:{}}));
describe('scheduled intelligence refresh',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','synthetic-cron-secret');});
  afterEach(()=>vi.unstubAllEnvs());
  it('refuses requests without the cron secret',async()=>{
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    vi.stubEnv('CRON_SECRET','');
    expect((await call('Bearer ')).status).toBe(401);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it('ingests public providers only, without an organization',async()=>{
    mocks.ingest.mockResolvedValue({eventsProcessed:3,evidenceRecords:3,diagnostics:[{providerId:'cisa-kev',status:'error',eventCount:0,durationMs:1}]});
    const response=await call('Bearer synthetic-cron-secret');
    expect(response.status).toBe(200);
    expect(mocks.ingest).toHaveBeenCalledWith(null,expect.objectContaining({providerIds:['usgs-earthquakes']}));
    expect(await response.json()).toEqual({eventsProcessed:3,evidenceRecords:3,failedProviders:['cisa-kev']});
  });
  it('does not leak database errors into the public workflow log',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    mocks.ingest.mockRejectedValue(new Error('DATABASE_CREDENTIAL_MUST_NOT_LEAK'));
    const response=await call('Bearer synthetic-cron-secret');
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('DATABASE_CREDENTIAL');
  });
});
