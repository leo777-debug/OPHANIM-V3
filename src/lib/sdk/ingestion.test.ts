import { afterEach, describe, expect, it, vi } from 'vitest';
import { ingestSdkEntities, normalizeSdkEntity, sdkKeyMatches, sdkState } from './ingestion';
const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
const input = { id: 'asset-one', position: { lat: 0, lng: 0 } };
afterEach(() => { vi.unstubAllEnvs(); sdkState(); });
describe('private SDK ingestion', () => {
  it('keeps missing confidence/time unknown, preserves zero confidence and separates receipt time', () => {
    const now = Date.parse('2026-10-20T10:00:00Z'), result = normalizeSdkEntity(input, 'test', now)!;
    expect(result.source.confidence).toBeNull(); expect(result.timestamp).toBeNull(); expect(result.receivedAt).toBe('2026-10-20T10:00:00.000Z');
    expect(normalizeSdkEntity({ ...input, confidence: 0 }, 'test', now)?.source.confidence).toBe(0);
    expect(normalizeSdkEntity({ ...input, timestamp: '2026-10-21T10:00:00Z' }, 'test', now)).toMatchObject({ timestamp: null, timeAnomaly: expect.any(String) });
    expect(normalizeSdkEntity({ id: 'bad', position: { lat: 91, lng: 0 } }, 'test', now)).toBeNull();
  });
  it('does not insert diagnostic fixtures into the store or stream version', () => {
    vi.stubEnv('SDK_ORGANIZATION_ID', first); const state = sdkState();
    const receipt = ingestSdkEntities('setup-diagnostic', [input], true);
    expect(receipt).toMatchObject({ accepted: 1, rejected: 0, diagnostic: true });
    expect(state.entities.size).toBe(0); expect(state.lastUpdate).toBe(0); expect(state.log).toEqual([]);
  });
  it('clears the process-local store when the configured organization changes', () => {
    vi.stubEnv('SDK_ORGANIZATION_ID', first); const now = Date.now(); ingestSdkEntities('test', [input], false, now); ingestSdkEntities('test', [input], false, now); expect(sdkState().entities.size).toBe(1);
    expect(sdkState().revision).toBe(2); expect(sdkState().lastUpdate).toBe(now);
    vi.stubEnv('SDK_ORGANIZATION_ID', second); expect(sdkState().entities.size).toBe(0); expect(sdkState().log).toEqual([]);
  });
  it('fails closed for absent/incorrect keys and accepts only exact configured credentials', () => {
    expect(sdkKeyMatches('fixture-only', '')).toBe(false); expect(sdkKeyMatches('wrong', 'fixture-only')).toBe(false);
    expect(sdkKeyMatches('fixture-only', 'fixture-only')).toBe(true); expect(sdkKeyMatches({}, 'fixture-only')).toBe(false);
  });
});
