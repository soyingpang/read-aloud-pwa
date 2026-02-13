const BUILD_ID = "2026-02-13-5";
const $ = (id) => document.getElementById(id);
const bust = (path) => {
  const u = new URL(path, location.href);
  u.searchParams.set("v", BUILD_ID);
  return u.toString();
};

const LS = {
  font: "reader:fontSize",
  last: "reader:lastProgress",
};

const els = {
  // sheet
  sheet: $("librarySheet"),
  backdrop: $("sheetBackdrop"),
  btnCloseTop: $("btnCloseLibrary"),
  btnCloseBottom: $("btnCloseLibraryBottom"),
  tabBooks: $("tabBooks"),
  tabChapters: $("tabChapters"),
  bookList: $("bookList"),
  chapterList: $("chapterList"),

  // open
  btnOpenLibrary: $("btnOpenLibrary"),
  btnOpenLibrary2: $("btnOpenLibrary2"),
  bbLibrary: $("bbLibrary"),

  // minimal toast (如果你有)
  toast: $("toast"),
};

function toast(msg) {
  if (!els.toast) {
    console.log("[toast]", msg);
    return;
  }
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add("hidden"), 1600);
}

/* ========= 最硬派的顯示/隱藏：class + inline style 雙保險 ========= */
function hardShow(el, display = "block") {
  if (!el) return;
  el.classList.remove("hidden");
  el.style.display = display;
  el.style.pointerEvents = "auto";
  el.setAttribute("aria-hidden", "false");
}
function hardHide(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.style.display = "none";
  el.style.pointerEvents = "none";
  el.setAttribute("aria-hidden", "true");
}

function isSheetOpen() {
  if (!els.sheet) return false;
  // 任何一種狀態都算 open：只要 display 不是 none 且沒有 hidden
  const display = getComputedStyle(els.sheet).display;
  return display !== "none" && !els.sheet.classList.contains("hidden");
}

function openSheet(tab = "books") {
  console.log("[sheet] open");
  hardShow(els.backdrop, "block");
  hardShow(els.sheet, "flex");
  document.body.style.overflow = "hidden";
  setTab(tab);
}

function closeSheet() {
  console.log("[sheet] close");
  hardHide(els.sheet);
  hardHide(els.backdrop);
  document.body.style.overflow = "";
  toast("已關閉書庫");
}

function toggleSheet(tab = "books") {
  if (isSheetOpen()) closeSheet();
  else openSheet(tab);
}

/* ========= Tab ========= */
function setTab(tab) {
  const isBooks = tab === "books";
  if (els.tabBooks) els.tabBooks.classList.toggle("active", isBooks);
  if (els.tabChapters) els.tabChapters.classList.toggle("active", !isBooks);
  if (els.bookList) els.bookList.classList.toggle("hidden", !isBooks);
  if (els.chapterList) els.chapterList.classList.toggle("hidden", isBooks);
}

/* ========= 最關鍵：capture phase 全域攔截，確保任何情況都關到 =========
   你目前的症狀「一直在最上層，關不了」，十之八九係事件被其他層吃掉/重新打開
   capture 會在最早階段攔截到，並 stopImmediatePropagation，保證不會再被其他 handler 打開
*/
function bindHardCloseCapture() {
  const selectors = [
    "#btnCloseLibrary",
    "#btnCloseLibraryBottom",
    "#sheetBackdrop",
  ].join(",");

  // 用 pointerdown 最穩（滑鼠/觸控都吃到）
  document.addEventListener("pointerdown", (e) => {
    if (!isSheetOpen()) return;

    const hit = e.target?.closest?.(selectors);
    if (!hit) return;

    console.log("[sheet] capture close by", hit.id || hit.className);
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    closeSheet();
  }, true);

  // click 作為備援（某些瀏覽器 pointerdown 行為不同）
  document.addEventListener("click", (e) => {
    if (!isSheetOpen()) return;

    const hit = e.target?.closest?.(selectors);
    if (!hit) return;

    console.log("[sheet] capture click-close by", hit.id || hit.className);
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    closeSheet();
  }, true);

  // ESC（桌面保險）
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isSheetOpen()) closeSheet();
  }, true);

  // 防止點 Sheet 內容時「誤關閉」
  if (els.sheet) {
    els.sheet.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    els.sheet.addEventListener("click", (e) => e.stopPropagation(), true);
  }
}

/* ========= 綁定打開按鈕 ========= */
function bindOpenButtons() {
  const openHandlers = [
    els.btnOpenLibrary,
    els.btnOpenLibrary2,
    els.bbLibrary,
  ].filter(Boolean);

  openHandlers.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSheet("books");
    });
  });
}

/* =========（可選）最小化渲染書籍清單：只要你現有 app 已有，可刪掉 ========= */
async function fetchJson(path) {
  const res = await fetch(bust(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`JSON讀取失敗：${path}`);
  return await res.json();
}

async function loadLibraryMinimal() {
  if (!els.bookList) return;
  try {
    const library = await fetchJson("texts/library.json");
    els.bookList.innerHTML = "";
    (library.books || []).forEach((b) => {
      const item = document.createElement("div");
      item.className = "item";
      const main = document.createElement("div");
      main.className = "itemMain";
      main.innerHTML = `<div class="itemTitle">${b.title || b.id}</div><div class="itemSub">點選以載入章節</div>`;
      item.appendChild(main);
      els.bookList.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    els.bookList.textContent = "載入失敗：請檢查 texts/library.json";
  }
}

/* ========= init ========= */
function init() {
  if (!els.sheet || !els.backdrop) {
    console.warn("[init] 找不到 librarySheet 或 sheetBackdrop，請確認 id");
  }

  // 強制確保在最上層（JS 再加一層保險）
  if (els.backdrop) {
    els.backdrop.style.zIndex = "9000";
    els.backdrop.style.position = "fixed";
    els.backdrop.style.pointerEvents = "auto";
  }
  if (els.sheet) {
    els.sheet.style.zIndex = "9001";
    els.sheet.style.position = "fixed";
    els.sheet.style.pointerEvents = "auto";
  }

  bindHardCloseCapture();
  bindOpenButtons();

  // 預設關閉（避免你說的「一直在最上層」）
  closeSheet();

  // 可選：如果你原本 app 已有 render，就刪呢行
  loadLibraryMinimal();

  toast(`已載入 v${BUILD_ID}`);
}

init();
