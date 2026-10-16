import { expect, it, vi } from 'vitest';
import { limitedFormData, RequestBodyLimitError } from './limited-form-data';

it('parses a bounded multipart upload without changing file contents', async () => {
  const form = new FormData();
  form.set('importType', 'shipments'); form.set('file', new File(['id,port\nDEMO,JEA'], 'demo.csv', { type: 'text/csv' }));
  const result = await limitedFormData(new Request('http://localhost/import', { method: 'POST', body: form }), 4096);
  expect(result.get('importType')).toBe('shipments');
  expect(await (result.get('file') as File).text()).toBe('id,port\nDEMO,JEA');
});
it('rejects declared oversized bodies before reading the stream', async () => {
  const pull = vi.fn();
  const request = new Request('http://localhost/import', { method: 'POST', headers: { 'Content-Length': '10000' }, body: new ReadableStream({ pull }), duplex: 'half' } as RequestInit);
  await expect(limitedFormData(request, 10)).rejects.toBeInstanceOf(RequestBodyLimitError);
  // Request construction may pre-pull; the helper must not initiate a read.
  expect(request.bodyUsed).toBe(false);
});
it.each([undefined, '1'])('enforces the actual byte cap with absent or dishonest length %s', async (length) => {
  const cancelled = vi.fn();
  let chunk = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(8)); chunk++; }, cancel: cancelled });
  const request = new Request('http://localhost/import', { method: 'POST', headers: length ? { 'Content-Length': length } : {}, body, duplex: 'half' } as RequestInit);
  await expect(limitedFormData(request, 10)).rejects.toBeInstanceOf(RequestBodyLimitError);
  expect(cancelled).toHaveBeenCalledOnce(); expect(chunk).toBeLessThanOrEqual(3);
});
