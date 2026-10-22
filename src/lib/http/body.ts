export async function boundedJson(request: Request, maxBytes = 16000): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw new Error('Request body exceeds size limit.');
  const reader = request.body?.getReader(); if (!reader) throw new Error('JSON body required.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const result = await reader.read(); if (result.done) break; size += result.value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error('Request body exceeds size limit.'); } chunks.push(result.value); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON body.'); }
}
