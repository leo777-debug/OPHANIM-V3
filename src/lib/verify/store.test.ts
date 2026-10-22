import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyClaim } from './service';
import { createShare, publicSnapshot, readRun, readShare, remember, revokeShare } from './store';
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('Verify private history and public shares', () => {
  it('whitelists only public finding fields, never actor/article/keys', async () => {
    const result = await verifyClaim(null, { fixture: 'earthquake' });
    const polluted = { ...result, previousId: 'private-id', inputUrl: 'https://private.invalid', userId: 'private-user', organizationId: 'private-org', article_snapshot: { text: 'FULL ARTICLE' }, apiKey: 'SECRET', aiSummary: { label: 'INFERENCE' as const, text: 'Private summary' } };
    const serialized = JSON.stringify(publicSnapshot(polluted));
    for (const privateValue of ['private-id', 'private-user', 'private-org', 'FULL ARTICLE', 'SECRET', 'Private summary', 'private.invalid']) expect(serialized).not.toContain(privateValue);
    expect(serialized).toContain(result.verdict); expect(serialized).toContain(result.checkedAt);
  });
  it('scopes transient run access to the opaque session', async () => {
    vi.stubEnv('DATABASE_URL', ''); const result = await verifyClaim(null, { fixture: 'earthquake' }); remember(result, 'owner');
    expect(await readRun(result.id, null, 'other')).toBeNull(); expect(await readRun(result.id, null, 'owner')).toEqual(result);
  });
  it('makes random-token shares revocable only by their creator', async () => {
    vi.stubEnv('DATABASE_URL', ''); const result = await verifyClaim(null, { fixture: 'dubai-fog' });
    const share = await createShare(result, null, 'owner'); expect(share.token).toHaveLength(64); expect(share.temporary).toBe(true);
    expect((await readShare(share.token))?.verdict).toBe('PARTLY TRUE');
    await revokeShare(share.token, null, 'other'); expect(await readShare(share.token)).not.toBeNull();
    await revokeShare(share.token, null, 'owner'); expect(await readShare(share.token)).toBeNull();
  });
  it('expires temporary shares and rejects malformed tokens', async () => {
    vi.stubEnv('DATABASE_URL', ''); const result = await verifyClaim(null, { fixture: 'opinion' }); const share = await createShare(result, null, 'owner');
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 31 * 60000);
    expect(await readShare(share.token)).toBeNull(); expect(await readShare('guess')).toBeNull();
  });
});
