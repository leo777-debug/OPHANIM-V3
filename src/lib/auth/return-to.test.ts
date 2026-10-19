import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';
describe('sign-in return destination', () => {
  it('returns users to the protected page and rejects external/ambiguous targets', () => {
    expect(safeReturnTo('/admin/integrations')).toBe('/admin/integrations');
    expect(safeReturnTo('/logistics/map?shipment=abc')).toBe('/logistics/map?shipment=abc');
    for (const value of [null, '//evil.example', '/\\evil.example', 'https://evil.example', '/%2fexample.com', '/%5cexample.com', '/\nexample.com']) expect(safeReturnTo(value)).toBe('/operations');
  });
});
