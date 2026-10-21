// Small RFC 5322 / MIME reader for forwarded emails: headers, multipart bodies,
// base64 and quoted-printable parts, and attachment file names.

export type MimeAttachment = { fileName: string; mimeType: string; bytes: Buffer };
export type ParsedEmail = { messageId: string | null; from: string | null; to: string[]; subject: string | null; date: string | null; text: string; attachments: MimeAttachment[] };

function splitHead(raw: string) {
  const index = raw.search(/\r?\n\r?\n/);
  return index < 0 ? { head: raw, body: '' } : { head: raw.slice(0, index), body: raw.slice(index).replace(/^\r?\n\r?\n/, '') };
}
export function parseHeaders(head: string) {
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const index = line.indexOf(':'); if (index < 1) continue;
    const name = line.slice(0, index).trim().toLowerCase(); if (!headers.has(name)) headers.set(name, line.slice(index + 1).trim());
  }
  return headers;
}
const param = (header: string | undefined, name: string) => header?.match(new RegExp(`${name}\\*?=(?:"([^"]*)"|([^;\\s]+))`, 'i'))?.slice(1).find(Boolean) ?? null;
/** Decode =?utf-8?B?...?= and =?utf-8?Q?...?= encoded words. */
export function decodeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, charset: string, encoding: string, data: string) => {
    const bytes = encoding.toLowerCase() === 'b' ? Buffer.from(data, 'base64') : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (__, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
    return new TextDecoder(/utf-?8/i.test(charset) ? 'utf-8' : 'latin1').decode(bytes);
  });
}
function decodeBody(body: string, encoding = '') {
  const kind = encoding.toLowerCase();
  if (kind === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64');
  if (kind === 'quoted-printable') return Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
  return Buffer.from(body, 'utf8');
}
const htmlToText = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').trim();

function walk(raw: string, out: { text: string[]; html: string[]; attachments: MimeAttachment[] }, depth = 0) {
  if (depth > 8) return;
  const { head, body } = splitHead(raw), headers = parseHeaders(head);
  const type = (headers.get('content-type') ?? 'text/plain').split(';')[0].trim().toLowerCase();
  const disposition = headers.get('content-disposition');
  const fileName = param(disposition, 'filename') ?? param(headers.get('content-type'), 'name');
  if (type.startsWith('multipart/')) {
    const boundary = param(headers.get('content-type'), 'boundary'); if (!boundary) return;
    const parts = body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\s*`)).slice(1).filter(part => part.trim() && part.trim() !== '--');
    for (const part of parts) walk(part, out, depth + 1);
    return;
  }
  if (type === 'message/rfc822' && !fileName) { walk(body, out, depth + 1); return; }
  const bytes = decodeBody(body, headers.get('content-transfer-encoding'));
  if (fileName || (disposition && /attachment/i.test(disposition))) { out.attachments.push({ fileName: decodeWords(fileName ?? 'attachment'), mimeType: type, bytes }); return; }
  if (type === 'text/plain') out.text.push(bytes.toString(/utf-?8/i.test(param(headers.get('content-type'), 'charset') ?? 'utf-8') ? 'utf8' : 'latin1'));
  else if (type === 'text/html') out.html.push(htmlToText(bytes.toString('utf8')));
}

export function parseEmail(raw: string | Buffer): ParsedEmail {
  const source = typeof raw === 'string' ? raw : raw.toString('latin1');
  const headers = parseHeaders(splitHead(source).head), out = { text: [] as string[], html: [] as string[], attachments: [] as MimeAttachment[] };
  walk(source, out);
  return {
    messageId: headers.get('message-id')?.replace(/[<>]/g, '') ?? null, from: headers.get('from') ? decodeWords(headers.get('from')!) : null,
    to: (headers.get('to') ?? '').split(',').map(item => item.trim()).filter(Boolean), subject: headers.get('subject') ? decodeWords(headers.get('subject')!) : null,
    date: headers.get('date') && Number.isFinite(Date.parse(headers.get('date')!)) ? new Date(Date.parse(headers.get('date')!)).toISOString() : null,
    text: (out.text.length ? out.text : out.html).join('\n\n').trim(), attachments: out.attachments,
  };
}
