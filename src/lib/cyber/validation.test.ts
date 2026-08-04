import { describe, expect, it } from 'vitest';
import { CyberValidationError, validateCyberAssetInput, validateCyberClientInput, validateVendorDependencyInput } from './validation';

describe('cyber inventory validation', () => {
  const clientId = '00000000-0000-4000-8000-000000000001';
  it('validates tenant client data and tags', () => expect(validateCyberClientInput({ name: 'Example Client', reference: 'EX-001', tags: 'MDR; Critical' })).toMatchObject({ reference: 'EX-001', tags: ['mdr', 'critical'] }));
  it('accepts a client-scoped IP asset and preserves inventory uncertainty', () => expect(validateCyberAssetInput({ customerId: clientId, assetName: 'VPN gateway', ipAddress: '203.0.113.10', internetFacing: 'true', verificationStatus: 'version_unknown' })).toMatchObject({ internetFacing: true, verificationStatus: 'version_unknown' }));
  it('rejects invalid IP inventory', () => expect(() => validateCyberAssetInput({ customerId: clientId, assetName: 'VPN', ipAddress: 'not-an-ip' })).toThrow(CyberValidationError));
  it('validates vendor dependencies without claiming verification', () => expect(validateVendorDependencyInput({ customerId: clientId, vendor: 'Example Vendor', verificationStatus: 'inventory_incomplete' }).verificationStatus).toBe('inventory_incomplete'));
});
