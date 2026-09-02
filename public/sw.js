/*
 * Service worker — offline-first app shell caching.
 * Strategy:
 *   - Precache the shell (/, offline fallback, manifest, icons).
 *   - Runtime cache (stale-while-revalidate) for static assets.
 *   - Navigation requests: network first, fall back to cached shell, then /offline.html.
 * Notifications are requested from the page via registration.showNotification().
 */

const VERSION = 'planner-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/', fresh.clone()).catch(() => undefined);
          return fresh;
        } catch (error) {
          const cache = await caches.open(SHELL_CACHE);
          const cached = (await cache.match(request)) || (await cache.match('/'));
          if (cached) return cached;
          const offline = await cache.match('/offline.html');
          if (offline) return offline;
          return new Response('آفلاین هستید و نسخه‌ی کش‌شده در دسترس نیست.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        if (cached) {
          fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
            })
            .catch(() => undefined);
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (error) {
          return new Response('', { status: 504 });
        }
      })(),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = allClients.find((client) => client.url.includes(self.location.origin));
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow('/');
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
