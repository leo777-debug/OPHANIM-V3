import { describe, expect, it, vi } from 'vitest';
import { articleObservationId, observeArticles } from './observations';
import { recordRuntimeFirstSeen } from '@/lib/runtime/store';
vi.mock('@/lib/runtime/store', () => ({ recordRuntimeFirstSeen: vi.fn(async (_scope: string, ids: string[], time: string) => ({ items: Object.fromEntries(ids.map(id => [id, time])), storage: 'memory', warning: 'No persistent store' })) }));
describe('public article observations', () => {
  it('retains identity across tracking changes, separates publishers, and rejects non-public URLs as identities', () => {
    const id = articleObservationId('source', 'http://www.example.com/a?utm_source=rss', 'Original title');
    expect(articleObservationId('source', 'https://example.com/a', 'Updated title')).toBe(id);
    expect(articleObservationId('other', 'https://example.com/a', 'Original title')).not.toBe(id);
    expect(articleObservationId('source', 'javascript:alert(1)', 'Title')).toBe(articleObservationId('source', '', 'Title'));
  });
  it('reports memory fallback and writes each article identity once', async () => {
    const id = articleObservationId('source', 'https://example.com/a', 'Title');
    const result = await observeArticles([id, id], '2026-10-20T10:00:00Z');
    expect(recordRuntimeFirstSeen).toHaveBeenCalledWith(`news-seen-${id[0]}`, [id], '2026-10-20T10:00:00Z');
    expect(result.storage).toBe('memory'); expect(result.warning).toContain('No persistent store');
    await expect(observeArticles(['not-a-hash'])).rejects.toThrow('identity');
  });
});
