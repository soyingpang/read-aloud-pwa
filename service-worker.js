const BUILD_ID = "2026-02-27-2";
const CACHE_NAME = `read-aloud-static-${BUILD_ID}`;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  `./index.html?v=${BUILD_ID}`,
  "./styles.css",
  `./styles.css?v=${BUILD_ID}`,
  "./app.js",
  `./app.js?v=${BUILD_ID}`,
  "./manifest.json",
  `./manifest.json?v=${BUILD_ID}`,
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.pathname.includes("/texts/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      let cached = await cache.match(event.request);
      if (!cached) cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;

      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })()
  );
});