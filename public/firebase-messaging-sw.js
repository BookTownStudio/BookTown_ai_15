/* No-op messaging worker shim.
 * Keeps root path resolvable and non-cacheable to avoid stale HTML rewrites.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
