import { describe, expect, it } from 'vitest';
import { decodeDelimitedFile, parseDelimited } from './format-detection';

describe('generic delimited import detection', () => {
  it('detects semicolon input and preserves quoted values', () => {
    const file = decodeDelimitedFile(new TextEncoder().encode('Name;Owner\n"North Port";"Acme; Logistics"'));
    expect(file.delimiter).toBe(';');
    expect(file.rows).toEqual([['Name', 'Owner'], ['North Port', 'Acme; Logistics']]);
  });

  it('supports escaped quotes and rejects invalid quoted input', () => {
    expect(parseDelimited('Name,Note\nPort,"A ""quoted"" note"', ',')[1]).toEqual(['Port', 'A "quoted" note']);
    expect(() => parseDelimited('Name\n"unclosed', ',')).toThrow('unclosed quoted field');
  });
});
