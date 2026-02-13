/* service-worker.js */
const SW_VERSION = "2026-02-13-4";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 1) 清所有 Cache
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}

    // 2) 立即接管頁面
    try { await self.clients.claim(); } catch {}

    // 3) 通知所有頁面 reload（可選）
    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "SW_DISABLED", version: SW_VERSION });
      }
    } catch {}

    // 4) 最重要：自毀（解除註冊），杜絕日後再派舊檔
    try { await self.registration.unregister(); } catch {}
  })());
});

// 不再攔截 fetch（讓瀏覽器直接走網絡/正常快取）
self.addEventListener("fetch", () => {});
