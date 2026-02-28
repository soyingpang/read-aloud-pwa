/* Service Worker (B strategy): update on next app open; never forces reload during playback.
   Version is resolved at runtime from build-meta.json (CI forbids hardcoded build-like strings). */

const CACHE_PREFIX = "read-aloud-cache-";
const FALLBACK_CACHE = "read-aloud-cache";

async function resolveBuildId() {
  try {
    const res = await fetch("./build-meta.json", { cache: "no-store" });
    if (!res.ok) return null;
    const meta = await res.json();
    return meta?.buildId || null;
  } catch {
    return null;
  }
}

let cacheNamePromise = (async () => {
  const bid = await resolveBuildId();
  return bid ? `${CACHE_PREFIX}${bid}` : FALLBACK_CACHE;
})();

self.addEventListener("install", (event) => {
  // B strategy: do NOT call skipWaiting(). Let it wait until all clients close.
  event.waitUntil((async () => {
    const cacheName = await cacheNamePromise;
    const cache = await caches.open(cacheName);
    // App shell: keep minimal; texts are runtime cached.
    await cache.addAll([
      "./",
      "./index.html",
      "./app.js",
      "./manifest.json",
      "./build-meta.json",
    ]);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = await cacheNamePromise;
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => (k.startsWith(CACHE_PREFIX) || k === FALLBACK_CACHE) && k !== keep)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return;

  const isTexts = url.pathname.includes("/texts/");

  event.respondWith((async () => {
    const cacheName = await cacheNamePromise;
    const cache = await caches.open(cacheName);

    // texts: cache-first, then network+cache (stability under weak network)
    if (isTexts) {
      const cached =
        (await cache.match(event.request)) ||
        (await cache.match(event.request, { ignoreSearch: true }));
      if (cached) return cached;

      try {
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      } catch {
        return new Response("offline and not cached", { status: 504 });
      }
    }

    // app shell/assets: stale-while-revalidate-ish
    const cached =
      (await cache.match(event.request)) ||
      (await cache.match(event.request, { ignoreSearch: true }));
    const fetchPromise = fetch(event.request)
      .then((res) => {
        if (res && res.ok) cache.put(event.request, res.clone());
        return res;
      })
      .catch(() => null);

    return cached || (await fetchPromise) || new Response("offline", { status: 504 });
  })());
});
