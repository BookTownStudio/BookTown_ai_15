/* BookTown SW reset shim.
 * Purpose: replace stale service workers and clear old caches deterministically.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    } catch (_err) {
      // Best-effort cache cleanup.
    }

    await self.clients.claim();

    try {
      await self.registration.unregister();
    } catch (_err) {
      // Best-effort unregister.
    }

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('navigate' in client) {
        client.navigate(client.url);
      }
    }
  })());
});
