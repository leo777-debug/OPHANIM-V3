import { describe, expect, it } from 'vitest';
import { previewEntityImport } from './generic-entity-import';

describe('generic entity import preview', () => {
  it('maps canonical names, aliases, identifiers, and selected fields', () => {
    const data = new TextEncoder().encode('Name,Alias,IMO,Country\nMSC IRINA,IRINA,9921234,Panama');
    const preview = previewEntityImport(data, 'vessel', {
      canonicalName: 'Name',
      aliases: ['Alias'],
      identifiers: [{ namespace: 'imo', column: 'IMO' }],
      attributes: { country: 'Country' },
    });
    expect(preview.validRows).toBe(1);
    expect(preview.rows[0].normalized).toMatchObject({
      entityType: 'vessel', canonicalName: 'MSC IRINA', aliases: ['IRINA'], identifiers: [{ namespace: 'imo', value: '9921234' }], attributes: { country: 'Panama' },
    });
  });

  it('marks repeated canonical names and spreadsheet formulas as invalid', () => {
    const data = new TextEncoder().encode('Name\nAcme\nAcme\n=1+1');
    const preview = previewEntityImport(data, 'company', { canonicalName: 'Name' });
    expect(preview.validRows).toBe(1);
    expect(preview.duplicateRows).toBe(1);
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[2].errors[0]).toContain('spreadsheet formula');
  });

  it('rejects mappings that reference missing source columns', () => {
    const data = new TextEncoder().encode('Name\nAcme');
    expect(() => previewEntityImport(data, 'company', { canonicalName: 'Missing' })).toThrow('mapped column is missing');
  });
});
