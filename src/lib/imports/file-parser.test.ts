import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { shipmentImportAdapter } from './adapters/shipment';
import { parseImportFile } from './file-parser';
import { previewImportRows } from './pipeline';

interface FormulaCell { formula: string; result: number }

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function columnName(index: number): string {
  let name = '';
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}

function sheetXml(rows: Array<Array<string | number | boolean | FormulaCell>>): string {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      if (typeof value === 'object') return `<c r="${reference}"><f>${xml(value.formula)}</f><v>${value.result}</v></c>`;
      if (typeof value === 'number') return `<c r="${reference}"><v>${value}</v></c>`;
      if (typeof value === 'boolean') return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
      return `<c r="${reference}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function workbookBytes(sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | FormulaCell>> }>): Uint8Array {
  const contentTypes = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentTypes}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet.rows)); });
  return zipSync(files);
}

describe('shipment import files', () => {
  it('parses .xlsx rows through the existing mapping and validation pipeline', async () => {
    const parsed = await parseImportFile(
      'active_shipments.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      workbookBytes([{ name: 'Active shipments', rows: [
        ['Shipment Reference', 'Carrier', 'ETA'],
        ['DXB-291', 'MSC', '2026-09-01T12:00:00.000Z'],
        ['', 'Maersk', 'not-a-date'],
      ] }]),
    );
    const preview = previewImportRows(shipmentImportAdapter, parsed);

    expect(preview).toMatchObject({ encoding: 'xlsx', sourceSheet: 'Active shipments', totalRows: 2, validRows: 1, invalidRows: 1 });
    expect(preview.mapping).toMatchObject({ shipmentReference: 'Shipment Reference', carrier: 'Carrier', plannedArrivalAt: 'ETA' });
    expect(preview.rows[0].normalized?.shipmentReference).toBe('DXB-291');
  });

  it('rejects workbook formulas before preview mapping', async () => {
    const bytes = workbookBytes([{ name: 'Shipments', rows: [
      ['Shipment Reference', 'Carrier'],
      ['DXB-291', { formula: '1+1', result: 2 }],
    ] }]);
    await expect(parseImportFile('shipments.xlsx', '', bytes)).rejects.toThrow('formulas are not accepted');
  });

  it('rejects ambiguous multi-sheet workbooks', async () => {
    const bytes = workbookBytes([
      { name: 'One', rows: [['Shipment Reference'], ['DXB-291']] },
      { name: 'Two', rows: [['Shipment Reference'], ['DXB-292']] },
    ]);
    await expect(parseImportFile('shipments.xlsx', '', bytes)).rejects.toThrow('one populated worksheet');
  });

  it('gives a safe conversion path for legacy .xls files', async () => {
    await expect(parseImportFile('shipments.xls', 'application/vnd.ms-excel', new Uint8Array([1]))).rejects.toThrow('Save the workbook as .xlsx or CSV');
  });
});
