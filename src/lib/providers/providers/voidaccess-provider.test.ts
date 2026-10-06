import { describe, expect, it } from 'vitest';
import { voidAccessProvider } from './voidaccess-provider';

describe('voidAccessProvider', () => {
  it('treats either a static token or a dedicated service account as configured', () => {
    const previous = {
      apiUrl: process.env.VOIDACCESS_API_URL,
      token: process.env.VOIDACCESS_API_TOKEN,
      email: process.env.VOIDACCESS_API_EMAIL,
      password: process.env.VOIDACCESS_API_PASSWORD,
    };
    process.env.VOIDACCESS_API_URL = 'https://voidaccess.example';
    delete process.env.VOIDACCESS_API_TOKEN;
    process.env.VOIDACCESS_API_EMAIL = 'provider@example.com';
    process.env.VOIDACCESS_API_PASSWORD = 'secret';
    expect(voidAccessProvider.isConfigured!()).toBe(true);
    Object.assign(process.env, previous);
  });

  it('normalizes queued investigations without exposing the remote provider URL', () => {
    const result = voidAccessProvider.normalize!({ status: 'queued', query: 'MSC IRINA', runId: 'run-1', message: 'Dark-web investigation queued.' }, {
      intent: 'dark_web_lookup', entityType: 'command', query: 'MSC IRINA', limit: 8,
    });
    expect(result[0]).toMatchObject({ label: 'Dark-web investigation queued', provider: 'voidaccess' });
    expect(result[0].summary).not.toContain('http');
  });
});
