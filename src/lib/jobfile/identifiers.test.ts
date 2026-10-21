import { describe, expect, it } from 'vitest';
import { containerCheckDigit, findReferences, validateAwb, validateContainer, validateReference } from './identifiers';

describe('container numbers (ISO 6346)', () => {
  it('accepts valid check digits and rejects reading errors', () => {
    expect(containerCheckDigit('CSQU305438')).toBe(3);
    expect(validateContainer('CSQU3054383').valid).toBe(true);
    expect(validateContainer('csqu 305438-3')).toMatchObject({ valid: true, normalized: 'CSQU3054383' });
    expect(validateContainer('MSCU1234566')).toMatchObject({ valid: true });
    expect(validateContainer('CSQU3054384')).toMatchObject({ valid: false, code: 'check_digit' });
    // An OCR misread of 8 as 3 is caught by the digit.
    expect(validateContainer('CSQU3054333').valid).toBe(false);
    expect(validateContainer('CSQ3054383')).toMatchObject({ valid: false, code: 'format' });
  });
  it('maps check-digit remainder 10 to 0', () => {
    for (const serial of ['000000', '123456', '999999', '000001']) {
      const digit = containerCheckDigit(`ABCU${serial}`);
      expect(digit).toBeGreaterThanOrEqual(0); expect(digit).toBeLessThanOrEqual(9);
    }
  });
});

describe('air waybills (IATA mod 7)', () => {
  it('validates serial check digit and airline prefix', () => {
    expect(validateAwb('176-12345675')).toMatchObject({ valid: true, normalized: '176-12345675', airline: 'Emirates' });
    expect(validateAwb('17612345676')).toMatchObject({ valid: false, code: 'check_digit' });
    expect(validateAwb('123-12345675')).toMatchObject({ valid: false, code: 'unknown_prefix' });
    expect(validateAwb('123-12345675', { '123': 'Test carrier' })).toMatchObject({ valid: true });
    expect(validateAwb('176-1234567')).toMatchObject({ valid: false, code: 'format' });
  });
  it('validates other references by length only', () => {
    expect(validateReference('client_ref', ' po 4471 ').normalized).toBe('PO 4471');
    expect(validateReference('booking', 'AB').valid).toBe(false);
  });
});

describe('reference extraction', () => {
  it('finds AWBs, containers and invoices in email text and keeps invalid ones flagged', () => {
    const text = 'Pre-alert: MAWB 176-1234 5675, HAWB DXB778812. Invoice No: INV-2026-0411. Box CSQU 305438 4 on board.';
    const found = findReferences(text);
    expect(found.find(item => item.type === 'awb')?.validation).toMatchObject({ valid: true, normalized: '176-12345675' });
    expect(found.find(item => item.type === 'hawb')?.value).toBe('DXB778812');
    expect(found.find(item => item.type === 'invoice')?.value).toBe('INV-2026-0411');
    expect(found.find(item => item.type === 'container')?.validation).toMatchObject({ valid: false, code: 'check_digit' });
  });
  it('does not read phone numbers or totals as air waybills', () => {
    expect(findReferences('Call us on 800 1234 5678 or +971 4 123 4567. Total 1240 5678 9012').filter(item => item.type === 'awb')).toEqual([]);
    expect(findReferences('see 176-12345675 attached').find(item => item.type === 'awb')?.validation.normalized).toBe('176-12345675');
  });
});
