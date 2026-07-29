import { describe, expect, it } from 'vitest';
import { didWatchlistChange, snapshotResults } from './snapshot';

describe('watchlist snapshots', () => {
  const result = { id: 'ip:8.8.8.8', label: '8.8.8.8', provider: 'ip-intelligence', summary: 'Example', type: 'ip', category: 'network', importance: 1, zoomLevel: 8 };
  it('does not notify on an initial snapshot', () => expect(didWatchlistChange(undefined, snapshotResults([result]))).toBe(false));
  it('detects a meaningful provider result change', () => expect(didWatchlistChange(snapshotResults([result]), snapshotResults([{ ...result, summary: 'Changed' }]))).toBe(true));
});
