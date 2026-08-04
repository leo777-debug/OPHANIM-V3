import { describe, expect, it } from 'vitest';
import { decodeUtf8Csv, escapeCsvCell, parseCsv } from './csv';
import { ImportError } from './types';

describe('shared import CSV parsing', () => {
  it('accepts UTF-8 files with a byte-order mark', () => {
    const bytes = new TextEncoder().encode('\uFEFFReference\nOPH-1');
    expect(decodeUtf8Csv(bytes)).toBe('Reference\nOPH-1');
  });

  it('rejects invalid UTF-8 input before CSV parsing', () => {
    expect(() => decodeUtf8Csv(new Uint8Array([0xc3, 0x28]))).toThrow('UTF-8');
  });

  it('preserves quoted CSV cells', () => {
    expect(parseCsv('Reference,Carrier\nOPH-1,"MSC, Shipping"')).toEqual([['Reference', 'Carrier'], ['OPH-1', 'MSC, Shipping']]);
  });

  it('neutralizes spreadsheet formulas in error report cells', () => {
    expect(escapeCsvCell('=HYPERLINK("https://example.test")')).toBe(`"'=HYPERLINK(""https://example.test"")"`);
  });

  it('rejects an unclosed quoted CSV cell', () => {
    expect(() => parseCsv('Reference\n"OPH-1')).toThrow(ImportError);
  });
});
