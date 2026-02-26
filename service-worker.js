/* service-worker.js
   目的：只快取靜態檔（index/css/js/manifest/圖示）
   不快取 texts/**（避免章節更新後用戶仍看到舊內容）

   版本來源：build-meta.json（單一來源）
*/

let BUILD_ID = "dev";
let CACHE_NAME = "read-aloud-static-dev";

async function loadBuildId() {
  try {
    const r = await fetch("./build-meta.json", { cache: "no-store" });
    const meta = await r.json();
    BUILD_ID = meta.buildId || "dev";
  } catch (e) {
    BUILD_ID = "dev";
  }
  CACHE_NAME = `read-aloud-static-${BUILD_ID}`;
  return BUILD_ID;
}

function staticAssets() {
  const v = BUILD_ID;
  return [
    "./",
    "./index.html",
    `./index.html?v=${v}`,
    "./styles.css",
    `./styles.css?v=${v}`,
    "./app.js",
    `./app.js?v=${v}`,
    "./manifest.json",
    `./manifest.json?v=${v}`,
    "./build-meta.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/maskable-192.png",
    "./icons/maskable-512.png",
  ];
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await loadBuildId();
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(staticAssets());
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await loadBuildId();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k.startsWith("read-aloud-static-") && k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // 不快取章節文本
  if (url.pathname.includes("/texts/")) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // 只處理同源靜態檔
  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;

    // 有些入口會是無 query；對於我們的靜態檔，嘗試對應 v 版本
    const path = url.pathname.replace(/^\//, "./");
    const isStatic =
      path === "./" ||
      path === "./index.html" ||
      path.endsWith("/index.html") ||
      path.endsWith("/styles.css") ||
      path.endsWith("/app.js") ||
      path.endsWith("/manifest.json") ||
      path.endsWith("/build-meta.json") ||
      path.includes("/icons/");

    if (isStatic && !url.searchParams.has("v")) {
      const vUrl = new URL(req.url);
      vUrl.searchParams.set("v", BUILD_ID);
      const cachedV = await cache.match(vUrl.toString());
      if (cachedV) return cachedV;
    }

    try {
      const res = await fetch(req);
      // 僅快取可被重用的靜態資源
      if (res.ok && isStatic) cache.put(req, res.clone());
      return res;
    } catch (e) {
      // 離線 fallback：至少回 index
      const fallback = await cache.match("./index.html") || await cache.match(`./index.html?v=${BUILD_ID}`);
      if (fallback) return fallback;
      throw e;
    }
  })());
});
