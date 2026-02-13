/* service-worker.js (對應 v=2026-02-13-7)
   目的：只快取靜態檔（index/css/js/manifest）
   不快取 texts/**（避免章節更新後用戶仍看到舊內容）
*/

const CACHE_NAME = "read-aloud-static-2026-02-13-7";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k)))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 章節/書庫資料永遠走網路，不快取（避免更新不同步）
  if (url.pathname.includes("/texts/")) return;

  // 只處理 GET
  if (event.request.method !== "GET") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    const res = await fetch(event.request);
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  })());
});
