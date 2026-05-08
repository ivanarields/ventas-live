// Kill switch: este SW se desregistra y borra todo el cache viejo.
// Necesario porque la version anterior cacheaba CSS/JS con cache-first
// y dejaba a los usuarios viendo versiones viejas tras cada deploy.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll();
      clients.forEach(client => client.navigate(client.url));
    })()
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
