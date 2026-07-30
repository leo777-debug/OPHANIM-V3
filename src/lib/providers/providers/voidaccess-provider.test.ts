import { describe, expect, it } from 'vitest';
import { voidAccessProvider } from './voidaccess-provider';

describe('voidAccessProvider', () => {
  it('normalizes queued investigations without exposing the remote provider URL', () => {
    const result = voidAccessProvider.normalize({ status: 'queued', query: 'MSC IRINA', runId: 'run-1', message: 'Dark-web investigation queued.' }, {
      intent: 'dark_web_lookup', entityType: 'command', query: 'MSC IRINA', limit: 8,
    });
    expect(result[0]).toMatchObject({ label: 'Dark-web investigation queued', provider: 'voidaccess' });
    expect(result[0].summary).not.toContain('http');
  });
});
