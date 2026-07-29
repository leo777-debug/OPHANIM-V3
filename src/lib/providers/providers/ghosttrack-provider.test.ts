import { describe, expect, it } from 'vitest';
import { ghostTrackProvider, parseGhostTrackOutput } from './ghosttrack-provider';

describe('parseGhostTrackOutput', () => {
  it('parses GhostTrack IP output after ANSI color codes are removed', () => {
    const parsed = parseGhostTrackOutput('\u001b[37m IP target :\u001b[32m 8.8.8.8\n City : Mountain View\n Country : United States\n Latitude : 37.386\n Longitude : -122.0838\n ASN : 15169\n ORG : Google LLC', 'ip');
    expect(parsed).toMatchObject({ ip: '8.8.8.8', city: 'Mountain View', country: 'United States', latitude: 37.386, longitude: -122.0838, asn: '15169', organization: 'Google LLC' });
  });

  it('parses discovered public username profiles only', () => {
    const parsed = parseGhostTrackOutput('[ + ] GitHub : https://www.github.com/octocat\n[ + ] Twitter : Username not found !', 'username');
    expect(parsed.profiles).toEqual([{ service: 'GitHub', url: 'https://www.github.com/octocat' }]);
  });

  it('returns a friendly unavailable result when GhostTrack is not installed', async () => {
    const previousDirectory = process.env.GHOSTTRACK_DIR;
    const previousEnabled = process.env.GHOSTTRACK_ENABLED;
    process.env.GHOSTTRACK_DIR = 'C:/definitely-missing-ghosttrack';
    process.env.GHOSTTRACK_ENABLED = 'true';
    try {
      const raw = await ghostTrackProvider.execute(
        { intent: 'ip_lookup', entityType: 'ip', query: '8.8.8.8', limit: 1 },
        { signal: new AbortController().signal, locale: 'en' },
      );
      const result = ghostTrackProvider.normalize(raw, { intent: 'ip_lookup', entityType: 'ip', query: '8.8.8.8', limit: 1 });
      expect(result[0]).toMatchObject({ label: 'GhostTrack unavailable', provider: 'ghosttrack' });
    } finally {
      if (previousDirectory === undefined) delete process.env.GHOSTTRACK_DIR;
      else process.env.GHOSTTRACK_DIR = previousDirectory;
      if (previousEnabled === undefined) delete process.env.GHOSTTRACK_ENABLED;
      else process.env.GHOSTTRACK_ENABLED = previousEnabled;
    }
  });
});
