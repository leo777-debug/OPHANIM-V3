import { afterEach,describe,expect,it,vi } from 'vitest';
import { demoReplayStatus } from './demo-replay';
afterEach(()=>vi.unstubAllEnvs());
describe('explicit synthetic replay metadata',()=>{
  it('is disabled by default and rejects invalid timestamps',()=>{
    vi.stubEnv('OPHANIM_DEMO_REPLAY_CREATED_AT','');expect(demoReplayStatus()).toEqual({enabled:false});
    vi.stubEnv('OPHANIM_DEMO_REPLAY_CREATED_AT','not-a-date');expect(demoReplayStatus()).toEqual({enabled:false});
  });
  it('returns only an explicit fixture timestamp/provenance, never user or organization data',()=>{
    vi.stubEnv('OPHANIM_DEMO_REPLAY_CREATED_AT','2026-10-15T12:00:00Z');
    expect(demoReplayStatus()).toEqual({enabled:true,createdAt:'2026-10-15T12:00:00.000Z',provenance:'synthetic_fixture'});
  });
});
