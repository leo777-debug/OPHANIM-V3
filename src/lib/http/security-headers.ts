export function securityHeaders(production: boolean) {
  const scripts = `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"} https://www.youtube.com https://s.ytimg.com`;
  return [
    { key: 'Content-Security-Policy', value: ["default-src 'self'", scripts, "style-src 'self' 'unsafe-inline' https:", "connect-src 'self' https: wss:", "img-src 'self' https: data: blob:", "font-src 'self' https: data:", "media-src 'self' https: blob:", "worker-src 'self' blob:", "frame-src 'self' https:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"].join('; ') + ';' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=()' },
  ];
}
