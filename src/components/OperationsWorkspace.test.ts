import { describe, expect, it } from 'vitest';
import { isMissingTableError } from './OperationsWorkspace';

describe('operations workspace missing-table handling', () => {
  it('recognises a database that has not received every migration', () => {
    expect(isMissingTableError(new Error('relation "ophanim_forecasts" does not exist'))).toBe(true);
  });
  it('keeps every other failure visible', () => {
    expect(isMissingTableError(new Error('Authentication is required.'))).toBe(false);
    expect(isMissingTableError('relation "x" does not exist')).toBe(false);
  });
});
