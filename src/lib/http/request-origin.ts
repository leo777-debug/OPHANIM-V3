export function trustedRequestOrigin(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const allowed = [new URL(request.url).origin];
  // A reverse proxy/Next standalone server can construct an internal URL.
  // Only the administrator's canonical APP_URL may add a public origin.
  if (process.env.APP_URL) {
    try {
      const canonical = new URL(process.env.APP_URL);
      if (['http:', 'https:'].includes(canonical.protocol) && !canonical.username && !canonical.password) allowed.push(canonical.origin);
    } catch { /* Invalid configuration cannot widen the boundary. */ }
  }
  return allowed.includes(origin);
}
