import {describe,expect,it} from 'vitest';
import {publicProviderEnvironment} from '../../../tools/presentation/preview-config.mjs';

describe('live preview environment boundary',()=>{
  it('forwards only public-provider credentials, never production database, auth, AI or customer AIS secrets',()=>{
    const result=publicProviderEnvironment({AIS_API_KEY:'test-public-key',OPENSKY_CLIENT_SECRET:'test-provider-secret',DATABASE_URL:'PRIVATE',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE',OPENAI_API_KEY:'PRIVATE',CUSTOMER_AIS_API_URL:'PRIVATE',MARINETRAFFIC_API_KEY:'PRIVATE'});
    expect(result).toEqual({AIS_API_KEY:'test-public-key',OPENSKY_CLIENT_SECRET:'test-provider-secret'});
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
});
