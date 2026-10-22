// Cheap text for matching before the document reader runs: plain text files and
// uncompressed PDF text operators. Photos and scanned PDFs get text from the reader.
export function textOf(file: { mimeType: string; bytes: Buffer; fileName?: string }): string {
  if (file.mimeType === 'text/plain') return file.bytes.toString('utf8').slice(0, 200000);
  if (file.mimeType === 'application/pdf') {
    const source = file.bytes.toString('latin1');
    const strings = [...source.matchAll(/\(((?:\\.|[^\\)]){1,400})\)\s*Tj|\[((?:\([^)]*\)\s*-?\d*\s*)+)\]\s*TJ/g)]
      .map(match => match[1] ?? (match[2] ?? '').replace(/\)\s*-?\d*\s*\(/g, '').replace(/^\(|\)$/g, ''))
      .map(value => value.replace(/\\([()\\])/g, '$1'));
    return strings.join(' ').slice(0, 200000);
  }
  return '';
}
