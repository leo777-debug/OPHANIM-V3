import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import readExcelFile, { type CellValue } from 'read-excel-file/node';
import { csvChecksum, decodeUtf8Csv, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseCsv } from './csv';
import { ImportError, type ImportFileEncoding } from './types';

const MAX_EXCEL_WORKSHEETS = 10;
const MAX_IMPORT_COLUMNS = 200;
const MAX_EXCEL_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_EXCEL_ENTRY_BYTES = 10 * 1024 * 1024;

export interface ParsedImportFile {
  rows: string[][];
  bytes: number;
  checksum: string;
  encoding: ImportFileEncoding;
  sourceSheet?: string;
}

function extension(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName.trim().toLowerCase());
  return match?.[1] ?? '';
}

function excelCellText(value: CellValue | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function inspectExcelArchive(input: Uint8Array): void {
  let uncompressedBytes = 0;
  let worksheets: Record<string, Uint8Array>;
  try {
    worksheets = unzipSync(input, {
      filter: (entry) => {
        uncompressedBytes += entry.originalSize;
        if (entry.originalSize > MAX_EXCEL_ENTRY_BYTES || uncompressedBytes > MAX_EXCEL_UNCOMPRESSED_BYTES) {
          throw new ImportError('The Excel workbook expands beyond the safe processing limit.');
        }
        return /^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name);
      },
    });
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('The selected file is not a valid .xlsx workbook.');
  }

  for (const xmlBytes of Object.values(worksheets)) {
    if (/<f(?:\s|>)/i.test(strFromU8(xmlBytes))) {
      throw new ImportError('Excel formulas are not accepted. Replace formulas with their displayed values before uploading.');
    }
  }
}

async function parseExcel(input: Uint8Array): Promise<ParsedImportFile> {
  if (!input.byteLength) throw new ImportError('The Excel file is empty.');
  if (input.byteLength > MAX_IMPORT_BYTES) throw new ImportError('The Excel file exceeds the 5 MB limit.');
  if (input[0] !== 0x50 || input[1] !== 0x4b) throw new ImportError('The selected file is not a valid .xlsx workbook.');

  inspectExcelArchive(input);
  let sheets: Awaited<ReturnType<typeof readExcelFile>>;
  try {
    sheets = await readExcelFile(Buffer.from(input));
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('The .xlsx workbook could not be read.');
  }
  if (sheets.length > MAX_EXCEL_WORKSHEETS) throw new ImportError(`Excel workbooks may contain at most ${MAX_EXCEL_WORKSHEETS} worksheets.`);
  const populated = sheets.filter((sheet) => sheet.data.some((row) => row.some((cell) => cell !== null)));
  if (!populated.length) throw new ImportError('The Excel workbook is empty.');
  if (populated.length > 1) throw new ImportError('Upload a workbook with one populated worksheet so the import source is unambiguous.');
  const worksheet = populated[0];
  if (worksheet.data.length - 1 > MAX_IMPORT_ROWS) throw new ImportError('The Excel file exceeds the 5,000-row limit.');
  const columnCount = Math.max(...worksheet.data.map((row) => row.length), 0);
  if (columnCount > MAX_IMPORT_COLUMNS) throw new ImportError(`The Excel file exceeds the ${MAX_IMPORT_COLUMNS}-column limit.`);

  const rows = worksheet.data.flatMap((row) => {
    const values = row.map((value) => excelCellText(value as CellValue | null));
    while (values.length && values.at(-1) === '') values.pop();
    return values.some((cell) => cell.length > 0) ? [values] : [];
  });
  if (rows.length < 2) throw new ImportError('The Excel file must contain a header and at least one data row.');

  return {
    rows,
    bytes: input.byteLength,
    checksum: createHash('sha256').update(input).digest('hex'),
    encoding: 'xlsx',
    sourceSheet: worksheet.sheet,
  };
}

export async function parseImportFile(fileName: string, mimeType: string, bytes: ArrayBuffer | Uint8Array): Promise<ParsedImportFile> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fileExtension = extension(fileName);
  const csv = fileExtension === 'csv' || (!fileExtension && mimeType === 'text/csv');
  const xlsx = fileExtension === 'xlsx' || (!fileExtension && mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  if (fileExtension === 'xls') throw new ImportError('Legacy .xls files are not supported. Save the workbook as .xlsx or CSV before uploading.');
  if (!csv && !xlsx) throw new ImportError('Choose a CSV or .xlsx file.');
  if (xlsx) return parseExcel(input);

  const decoded = decodeUtf8Csv(input);
  return {
    rows: parseCsv(decoded),
    bytes: Buffer.byteLength(decoded, 'utf8'),
    checksum: csvChecksum(decoded),
    encoding: 'utf-8',
  };
}
