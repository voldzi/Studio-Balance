const CACHE_NAME = "studio-balance-static-v2";
const APP_SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/images/studio-balance/brand-logo.jpg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("studio-balance-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  const isStaticAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/images/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/icon" || url.pathname === "/apple-icon";
  if (!isStaticAsset) return;

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
    if (!response.ok) return response;
    const copy = response.clone();
    void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    return response;
  })));
});
