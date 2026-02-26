/* service-worker.js (對應 v=2026-02-27-1)
   目的：只快取靜態檔（index/css/js/manifest/圖示）
   不快取 texts/**（避免章節更新後用戶仍看到舊內容）

   修正：
   1) index.html 以 ?v=BUILD_ID 載入靜態資源，原本快取清單未包含 query，導致快取命中失敗。
   2) CACHE_NAME 與 manifest/start_url 版本不同步，可能造成更新不生效或錯誤的離線資源。
*/

const BUILD_ID = "2026-02-27-1";
const CACHE_NAME = `read-aloud-static-${BUILD_ID}`;

// 同時快取「有 query」與「無 query」版本，避免不同入口造成 miss
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

    // 由於資源可能帶有 ?v=xxx，先嘗試原始 request，再忽略 query
    let cached = await cache.match(event.request);
    if (!cached) cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;

    const res = await fetch(event.request);
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  })());
});
