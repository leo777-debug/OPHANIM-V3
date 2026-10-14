export class RequestBodyLimitError extends Error {
  constructor() { super('Upload exceeds the request size limit.'); }
}

export async function limitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) throw new RequestBodyLimitError();
  if (!request.body) throw new Error('Upload body is missing.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyLimitError();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  // Bound the stream before handing it to the multipart parser. Content-Length
  // alone is not trusted: chunked or dishonest requests have the same cap.
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type') ?? '' }, body }).formData();
}
