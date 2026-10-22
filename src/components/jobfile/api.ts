'use client';
/** Small fetch helpers for job-file screens; errors surface as messages, never crashes. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal }), body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Request failed.'), { status: response.status });
  return body as T;
}
export async function sendJson<T>(url: string, method: 'POST' | 'PATCH', payload: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Update failed.'), { status: response.status });
  return body as T;
}
