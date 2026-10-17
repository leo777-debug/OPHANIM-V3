export class AiProviderError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'AiProviderError';
  }
}

async function readErrorPayload(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function providerError(response: Response): Promise<AiProviderError> {
  if (response.status !== 429) return new AiProviderError(`AI provider returned ${response.status}`, response.status);
  const payload = await readErrorPayload(response);
  const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const nested = raw.error && typeof raw.error === 'object' ? raw.error as Record<string, unknown> : {};
  const description = [raw.code, raw.type, raw.message, raw.error, nested.code, nested.type, nested.message]
    .filter(value => typeof value === 'string').join(' ').slice(0, 4000).toLowerCase();
  const retry = Number(response.headers.get('retry-after'));
  const retryAfterSeconds = Number.isFinite(retry) && retry > 0 && retry <= 86400 ? Math.ceil(retry) : undefined;
  // Classify the response, but never echo provider text: it may contain keys or prompts.
  const message = /quota|billing|budget|credit|monthly/.test(description)
    ? 'AI provider reported a quota or budget limit (429). Check provider Usage, billing limits and monthly allowance; retrying may not help.'
    : /capacity|overload|too busy/.test(description)
      ? 'AI provider reported a capacity limit (429). Wait before retrying; this response alone does not establish that your account allowance is exhausted.'
    : /token|\btpm\b/.test(description)
      ? 'AI provider token-rate limit reached (429). Wait for the token window to reset and reduce the supplied context.'
      : 'AI provider rate limit or quota reached (429). Turn off automatic summaries and check provider Usage and Limits before retrying.';
  return new AiProviderError(message + (retryAfterSeconds ? ` Retry after ${retryAfterSeconds} seconds.` : ''), 429, retryAfterSeconds);
}
