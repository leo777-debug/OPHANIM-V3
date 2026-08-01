import { describe, expect, it } from 'vitest';
import { previewShipmentCsv } from './csv-import';
import { assessShipmentImportConfirmation } from './shipment-import-service';

const actor = { userId: 'user-1', organizationId: 'organization-a', role: 'operations_manager' as const };

describe('shipment import confirmation', () => {
  it('separates existing shipment duplicates from accepted rows', () => {
    const preview = previewShipmentCsv('Shipment Reference\nOPH-2941\nOPH-2942');
    expect(assessShipmentImportConfirmation(actor, preview, [{ shipmentReference: 'OPH-2941' }])).toEqual({
      acceptedRows: 1,
      duplicateExistingRows: 1,
      rejectedRows: 0,
    });
  });

  it('requires an organization actor before confirmation', () => {
    const preview = previewShipmentCsv('Shipment Reference\nOPH-2941');
    expect(() => assessShipmentImportConfirmation({ ...actor, organizationId: '' }, preview, [])).toThrow('authenticated organization actor');
  });
});
