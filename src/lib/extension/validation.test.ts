import { describe, expect, it } from 'vitest';
import { validateExtensionContextInput } from './validation';

describe('extension context validation', () => {
  it('keeps only small structured entity records', () => {
    const result = validateExtensionContextInput({
      page: { url: 'https://mail.google.com/mail/u/0/#inbox/1', title: 'Shipment update', adapter: 'gmail' },
      entities: [
        { type: 'shipment_reference', value: ' DXB-291 ', confidence: 92, source: 'gmail' },
        { type: 'shipment_reference', value: 'dxb-291', confidence: 80, source: 'generic' },
        { type: 'unknown', value: 'ignored' },
      ],
      pageText: 'must never be accepted or returned',
    });
    expect(result.entities).toEqual([{ type: 'shipment_reference', value: 'DXB-291', confidence: 92, source: 'gmail' }]);
    expect(result).not.toHaveProperty('pageText');
  });

  it('rejects non-web page URLs', () => {
    expect(() => validateExtensionContextInput({ page: { url: 'file:///secret.txt' }, entities: [] })).toThrow('Only web page URLs');
  });
});
