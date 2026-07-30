import { describe, expect, it } from 'vitest';
import { maigretProvider } from './maigret-provider';

describe('maigretProvider', () => {
  it('normalizes public profile results without exposing an executable path', () => {
    const results = maigretProvider.normalize({
      status: 'ok', username: 'octocat', accounts: [{ site: { name: 'GitHub' }, url_user: 'https://github.com/octocat' }],
    }, { intent: 'username_lookup', entityType: 'username', query: 'octocat', limit: 8 });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ provider: 'maigret', label: '@octocat' });
    expect(results[1]).toMatchObject({ label: 'GitHub', summary: 'https://github.com/octocat' });
  });
});
