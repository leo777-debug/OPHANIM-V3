export const DEFAULT_BACKEND_ORIGIN = 'http://localhost:3000';
export const PRODUCTION_BACKEND_ORIGIN = 'https://ophanim.live';

export async function backendOrigin() {
  const stored = await chrome.storage.sync.get('ophanimBackendOrigin');
  const candidate = typeof stored.ophanimBackendOrigin === 'string' ? stored.ophanimBackendOrigin.trim() : '';
  try {
    const parsed = new URL(candidate || DEFAULT_BACKEND_ORIGIN);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
    return parsed.origin;
  } catch {
    return DEFAULT_BACKEND_ORIGIN;
  }
}
