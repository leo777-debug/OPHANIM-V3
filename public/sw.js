/* Ophanim public offline shell. Authenticated HTML, APIs and third-party resources are never cached. */
const SHELL_CACHE = 'ophanim-offline-shell-v1';
const SHELL_FILES = ['/offline.html', '/offline-snapshot.js', '/favicon.svg', '/site.webmanifest', '/android-chrome-192x192.png', '/android-chrome-512x512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ophanim-offline-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.search === '' && SHELL_FILES.includes(url.pathname)) {
    event.respondWith(caches.open(SHELL_CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  } else if (request.mode === 'navigate') {
    // Never store a navigation response: it may contain private organization data.
    event.respondWith(fetch(request).catch(() => caches.open(SHELL_CACHE).then(async cache => (await cache.match('/offline.html')) || new Response('Offline. No public shell is cached on this device. Reconnect to load Ophanim.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
  }
});
