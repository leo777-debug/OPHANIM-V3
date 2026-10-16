export function safePopupUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '#';
    return url.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  } catch { return '#'; }
}
