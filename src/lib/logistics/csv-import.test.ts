import { describe, expect, it } from 'vitest';
import { previewShipmentCsv, ShipmentImportError } from './csv-import';

describe('shipment CSV preview', () => {
  const validCsv = [
    'Shipment Reference,Carrier,IMO,Planned Arrival',
    'OPH-2941,MSC,9728941,2026-08-02T16:00:00Z',
  ].join('\n');

  it('detects columns and validates a complete preview row', () => {
    const preview = previewShipmentCsv(validCsv);
    expect(preview.mapping).toMatchObject({ shipmentReference: 'Shipment Reference', imoNumber: 'IMO' });
    expect(preview.validRows).toBe(1);
  });

  it('reports duplicate shipment references without discarding rows', () => {
    const preview = previewShipmentCsv(`${validCsv}\nOPH-2941,MSC,9728941,2026-08-02T16:00:00Z`);
    expect(preview.totalRows).toBe(2);
    expect(preview.duplicateRows).toBe(1);
    expect(preview.rows[1].errors[0]).toContain('duplicates CSV row 2');
  });

  it('rejects spreadsheet formulas in mapped cells', () => {
    const preview = previewShipmentCsv('Shipment Reference,Carrier\nOPH-2941,=1+1');
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0].errors[0]).toContain('spreadsheet formula');
  });

  it('requires a shipment-reference mapping', () => {
    expect(() => previewShipmentCsv('Carrier\nMSC')).toThrow(ShipmentImportError);
  });
});
