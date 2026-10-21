import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest';
import {feedIds} from './feeds';
const mocks=vi.hoisted(()=>({load:vi.fn(),query:vi.fn(),release:vi.fn()}));
vi.mock('./public-loaders',()=>({loadPublicPayload:mocks.load}));
vi.mock('@/lib/db/pool',()=>({db:()=>({query:mocks.query,connect:async()=>({query:mocks.query,release:mocks.release})})}));
vi.mock('@/lib/auth/actor',()=>({requireAuthenticatedActor:vi.fn()}));
describe('independent feeds and honest replay',()=>{
  beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv('DATABASE_URL','postgresql://local-test');});
  afterEach(()=>vi.unstubAllEnvs());
  it('uses live observations when they succeed',async()=>{
    mocks.load.mockResolvedValue({earthquakes:[]});
    const {presentationFeed}=await import('./snapshots');
    const result=await presentationFeed('earthquakes','auto');
    expect(result.state).toBe('live');expect(result.recordedAt).toBeNull();expect(mocks.query).not.toHaveBeenCalled();
  });
  it('falls back only the failed source and keeps its original recording time',async()=>{
    mocks.load.mockRejectedValue(new Error('Provider error with credential=NEVER'));
    const recorded='2026-10-15T10:00:00Z';
    mocks.query.mockResolvedValue({rows:[{payload:{id:'maritime',features:[],news:[],source:'AIS',publicOnly:true},recorded_at:recorded}]});
    const {presentationFeed}=await import('./snapshots');
    const result=await presentationFeed('maritime','auto');
    expect(result.state).toBe('replay');expect(result.recordedAt).toBe('2026-10-15T10:00:00.000Z');expect(JSON.stringify(result)).not.toContain('NEVER');
  });
  it('ON replay never calls live providers, even if no snapshot exists',async()=>{
    mocks.query.mockResolvedValue({rows:[]});
    const {presentationFeed}=await import('./snapshots');
    const result=await presentationFeed('fires','on');
    expect(result.state).toBe('unavailable');expect(result.note).toContain('No recorded snapshot');expect(mocks.load).not.toHaveBeenCalled();
  });
  it('rejects legacy maritime snapshots and mixed live payloads instead of publishing customer records',async()=>{
    mocks.load.mockResolvedValue({ships:[{name:'PRIVATE',lat:25,lng:55}]});
    mocks.query.mockResolvedValue({rows:[{payload:{id:'maritime',features:[{properties:{name:'PRIVATE'}}]},recorded_at:new Date()}]});
    const {presentationFeed}=await import('./snapshots');
    for(const mode of ['off','on','auto'] as const) {
      const result=await presentationFeed('maritime',mode);
      expect(result.state).toBe('unavailable');
      expect(JSON.stringify(result)).not.toContain('PRIVATE');
    }
  });
  it('OFF replay does not silently substitute old data',async()=>{
    mocks.load.mockRejectedValue(new Error('No live data'));
    const {presentationFeed}=await import('./snapshots');
    expect((await presentationFeed('flights','off')).state).toBe('unavailable');expect(mocks.query).not.toHaveBeenCalled();
  });
  it('bounds a hung feed while an independent feed can succeed',async()=>{
    vi.useFakeTimers();
    try {
      mocks.load.mockImplementation(id=>id==='weather'?new Promise(()=>{}):Promise.resolve({earthquakes:[]}));
      const {presentationFeed}=await import('./snapshots');
      const slow=presentationFeed('weather','off');
      expect((await presentationFeed('earthquakes','off')).state).toBe('live');
      await vi.advanceTimersByTimeAsync(14001);
      expect((await slow).state).toBe('unavailable');
    }finally{vi.useRealTimers();}
  });
  it('coalesces simultaneous identical requests and caches public results',async()=>{
    mocks.load.mockResolvedValue({earthquakes:[]});
    const {currentPublicFeed}=await import('./snapshots');
    await Promise.all([currentPublicFeed('earthquakes'),currentPublicFeed('earthquakes')]);
    await currentPublicFeed('earthquakes');expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it('records only successful public feeds and retains older failed-source snapshots',async()=>{
    mocks.load.mockImplementation(id=>id==='earthquakes'?Promise.resolve({earthquakes:[]}):Promise.reject(new Error('Source down')));
    mocks.query.mockResolvedValue({rows:[]});
    const {recordPublicSnapshots}=await import('./snapshots');
    const result=await recordPublicSnapshots({userId:'test-user',organizationId:'test-org',role:'owner'});
    expect(result.saved).toEqual(['earthquakes']);expect(result.unavailable).toHaveLength(feedIds.length-1);
    const sql=mocks.query.mock.calls.map(call=>call[0]).join('\n');
    expect(sql).toContain('presentation_audit');expect(sql).not.toMatch(/delete from ophanim_presentation_snapshots/);
    expect(mocks.query.mock.calls.filter(call=>String(call[0]).startsWith('insert into ophanim_presentation_snapshots'))).toHaveLength(1);
    expect(mocks.release).toHaveBeenCalled();
  });
  it('does not let a viewer record snapshots or contact live providers',async()=>{
    const {recordPublicSnapshots}=await import('./snapshots');
    await expect(recordPublicSnapshots({userId:'test-user',organizationId:'test-org',role:'viewer'})).rejects.toThrow();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
