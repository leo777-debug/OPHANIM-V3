export class MarketingInputError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'MarketingInputError';
  }
}

export async function readMarketingBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new MarketingInputError('Please check the form and try again.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new MarketingInputError('Your submission is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new MarketingInputError('Please check the form and try again.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MarketingInputError('Please check the form and try again.');
  }
  return value as Record<string, unknown>;
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function optionalText(value: unknown, maxLength: number) {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

export function isEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const requestLog = new Map<string, number[]>();

export function isRateLimited(key: string, limit = 6, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter((time) => now - time < windowMs);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > limit;
}

export function requestIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}
