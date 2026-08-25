const STATIC_CACHE = "inventario-static-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([
      "/manifest.webmanifest",
      "/favicon.svg",
      "/pwa-icon-192.svg",
      "/pwa-icon-512.svg",
      "/pwa-icon-maskable.svg"
    ]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  const isStaticAsset = requestUrl.origin === self.location.origin
    && ["script", "style", "image", "font"].includes(event.request.destination);

  // API responses, documents and form submissions are intentionally excluded:
  // they may contain private, business-scoped or session-dependent data.
  if (!isStaticAsset || event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
