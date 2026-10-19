/** Same-site navigation only, including protection against encoded separators. */
export function safeReturnTo(value: string | null, fallback = '/operations'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u0020]/.test(decoded)) return fallback;
    const url = new URL(value, 'https://ophanim.invalid');
    return url.origin === 'https://ophanim.invalid' ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
