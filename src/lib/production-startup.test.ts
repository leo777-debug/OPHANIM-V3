import { describe, expect, it } from 'vitest';
import config from '../../next.config';

describe('production startup configuration', () => {
  it('keeps standalone packaging without eagerly loading all route modules', () => {
    expect(config.output).toBe('standalone');
    expect(config.experimental?.preloadEntriesOnStart).toBe(false);
  });
});
