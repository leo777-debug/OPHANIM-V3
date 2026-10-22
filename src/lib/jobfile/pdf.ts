// Minimal PDF 1.4 writer for draft papers: A4 pages, Helvetica text, boxes and an
// optional JPEG logo. No external dependency. Latin text only (Arabic needs an
// embedded font and shaping; drafts print English labels and values).

export type PdfItem =
  | { kind: 'text'; x: number; y: number; size?: number; bold?: boolean; text: string }
  | { kind: 'box'; x: number; y: number; w: number; h: number; fill?: number }
  | { kind: 'image'; x: number; y: number; w: number; h: number };
export type PdfPage = PdfItem[];

const escape = (value: string) => value.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
function jpegSize(bytes: Buffer) {
  for (let offset = 2; offset < bytes.length - 9;) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1], length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return null;
}

/** Build a PDF. Coordinates are points from the top-left of an A4 page (595 × 842). */
export function buildPdf(pages: PdfPage[], options: { title?: string; logoJpeg?: Buffer | null } = {}): Buffer {
  const objects: Array<string | Buffer> = [];
  const add = (body: string | Buffer) => { objects.push(body); return objects.length; };
  const catalog = add(''), pagesId = add(''), regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const logo = options.logoJpeg && jpegSize(options.logoJpeg);
  const image = logo ? add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${options.logoJpeg!.length} >>\nstream\n`), options.logoJpeg!, Buffer.from('\nendstream')])) : 0;
  const kids: number[] = [];
  for (const page of pages) {
    const ops = page.map(item => {
      const top = 842 - item.y;
      if (item.kind === 'text') return `BT /${item.bold ? 'F2' : 'F1'} ${item.size ?? 9} Tf ${item.x} ${top - (item.size ?? 9)} Td (${escape(item.text)}) Tj ET`;
      if (item.kind === 'box') return `${item.fill !== undefined ? `${item.fill} g ` : ''}0.5 w ${item.x} ${top - item.h} ${item.w} ${item.h} re ${item.fill !== undefined ? 'B' : 'S'} 0 g`;
      return image ? `q ${item.w} 0 0 ${item.h} ${item.x} ${top - item.h} cm /Im1 Do Q` : '';
    }).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >>${image ? ` /XObject << /Im1 ${image} 0 R >>` : ''} >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(id => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${escape(options.title ?? 'Ophanim draft')}) /Producer (Ophanim) >>`);
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')], offsets: number[] = [];
  let length = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'), Buffer.from('\nendobj\n')]);
    chunks.push(chunk); length += chunk.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  return Buffer.concat([...chunks, Buffer.from(xref, 'latin1')]);
}
