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

  const isTexts = url.pathname.includes("/texts/");

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // texts: cache-first (keeps library/chapters available across network hiccups and offline)
      if (isTexts) {
        const cached =
          (await cache.match(event.request)) ||
          (await cache.match(event.request, { ignoreSearch: true }));
        if (cached) return cached;

        try {
          const res = await fetch(event.request);
          if (res && res.ok) cache.put(event.request, res.clone());
          return res;
        } catch (e) {
          return new Response("offline and not cached", { status: 504 });
        }
      }

      let cached = await cache.match(event.request);
      if (!cached) cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;

      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })()
  );
});