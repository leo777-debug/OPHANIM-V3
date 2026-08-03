import { describe, expect, it } from 'vitest';
import { shipmentImportAdapter } from './adapters/shipment';
import { previewImportCsv } from './pipeline';

describe('shared import pipeline', () => {
  it('uses shipment aliases and exposes an editable mapping', () => {
    const preview = previewImportCsv(shipmentImportAdapter, 'Shipment Reference,Carrier\nOPH-2941,MSC');
    expect(preview.mapping).toMatchObject({ shipmentReference: 'Shipment Reference', carrier: 'Carrier' });
    expect(preview.rows[0].normalized?.shipmentReference).toBe('OPH-2941');
  });

  it('reports formulas and duplicate rows without discarding raw rows', () => {
    const preview = previewImportCsv(shipmentImportAdapter, 'Shipment Reference,Carrier\nOPH-2941,=1+1\nOPH-2942,MSC\nOPH-2942,MSC');
    expect(preview.rows[0]).toMatchObject({ status: 'invalid' });
    expect(preview.rows[2]).toMatchObject({ status: 'duplicate_in_file' });
    expect(preview.rows[2].raw.Carrier).toBe('MSC');
  });
});
