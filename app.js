/* app.js */
const BUILD_ID = "2026-02-13-4";
const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 1600);
}

/** ====== SW 系統層面：逼用家升級（非常重要） ====== */
(function swSafetyNet() {
  if (!("serviceWorker" in navigator)) return;

  // 收到 SW 自毀通知 -> reload 一次，確保拿到最新檔
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e?.data?.type === "SW_DISABLED") {
      location.reload();
    }
  });

  // 逼瀏覽器立即 check SW 更新（加速全體用家同步）
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) reg.update();
  }).catch(() => {});
})();

/** ====== 你的元素（按你現有頁面 id，盡量兼容） ====== */
const els = {
  sheet: $("librarySheet") || $("sheet") || document.querySelector(".sheet"),
  backdrop: $("sheetBackdrop") || $("backdrop") || document.querySelector(".backdrop"),
  openBtns: [
    $("btnOpenLibrary"),
    $("btnOpenLibrary2"),
    $("bbLibrary"),
  ].filter(Boolean),
};

// 兼容你舊 UI：關閉按鈕可能叫唔同 id/class
function getCloseButtons() {
  const list = [];

  // 我版 id
  const a = $("btnCloseLibrary");
  const b = $("btnCloseLibraryBottom");
  if (a) list.push(a);
  if (b) list.push(b);

  // 你舊版可能存在嘅 selector（從截圖「X 關閉」推斷）
  document.querySelectorAll(
    [
      "#closeLibrary",
      "#btnClose",
      "#btnCloseSheet",
      ".closeBtn",
      ".btnClose",
      "button[aria-label*='關閉']",
      "button[data-close='library']",
      "button[data-action='close']",
    ].join(",")
  ).forEach((x) => list.push(x));

  // 去重
  return Array.from(new Set(list));
}

function isSheetOpen() {
  if (!els.sheet) return false;
  return !els.sheet.classList.contains("hidden");
}

function show(el) {
  if (!el) return;
  el.classList.remove("hidden");
  el.classList.add("open");
  el.style.pointerEvents = "auto";
}

function hide(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.classList.remove("open");
  el.style.pointerEvents = "none";
}

function openSheet() {
  show(els.backdrop);
  show(els.sheet);

  // 防止背景滾動／點擊偏移
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  hide(els.sheet);
  hide(els.backdrop);
  document.body.style.overflow = "";
  toast("已關閉書庫");
}

function toggleSheet() {
  if (isSheetOpen()) closeSheet();
  else openSheet();
}

/** ====== 關閉事件：用 capture 強制吃到點擊（重新思考後的核心修正） ======
 *  就算有其他層 stopPropagation / overlay，capture 都會先收到。
 */
function bindCloseForce() {
  // 1) 任何「點到關閉按鈕」都關（capture + bubble 都綁）
  const attach = (node) => {
    if (!node) return;

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSheet();
    };

    node.addEventListener("pointerdown", handler, { passive: false, capture: true });
    node.addEventListener("click", handler, { capture: true });
    node.addEventListener("pointerdown", handler, { passive: false });
    node.addEventListener("click", handler);
  };

  getCloseButtons().forEach(attach);

  // 2) 點 backdrop 也關（capture）
  if (els.backdrop) {
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSheet();
    };
    els.backdrop.addEventListener("pointerdown", handler, { passive: false, capture: true });
    els.backdrop.addEventListener("click", handler, { capture: true });
  }

  // 3) 保障：就算按鈕 id/class 對唔上，仍然用事件委派（capture）攔截
  document.addEventListener("click", (e) => {
    if (!isSheetOpen()) return;

    const t = e.target;
    // 命中任一「像關閉」嘅按鈕就關
    const hit = t?.closest?.(
      [
        "#btnCloseLibrary",
        "#btnCloseLibraryBottom",
        "#closeLibrary",
        "#btnClose",
        "#btnCloseSheet",
        ".closeBtn",
        ".btnClose",
        "button[aria-label*='關閉']",
        "button[data-close='library']",
        "button[data-action='close']",
      ].join(",")
    );

    if (hit) {
      e.preventDefault();
      e.stopPropagation();
      closeSheet();
    }
  }, true);

  // 4) ESC 關閉（桌面保險）
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isSheetOpen()) closeSheet();
  });
}

/** ====== 打開書庫按鈕 ====== */
function bindOpen() {
  els.openBtns.forEach((btn) => btn.addEventListener("click", toggleSheet));
}

/** ====== 初始化 ====== */
function init() {
  // 基本防呆
  if (!els.sheet) {
    console.warn("[APP] 找不到 sheet 元素（#librarySheet 或 .sheet）");
  }
  if (!els.backdrop) {
    console.warn("[APP] 找不到 backdrop 元素（#sheetBackdrop 或 .backdrop）");
  }

  // 強制確保可點
  if (els.sheet) {
    els.sheet.style.pointerEvents = "auto";
    // 重要：避免被其它層壓住（JS 再保險一次）
    els.sheet.style.zIndex = "9001";
    els.sheet.style.position = "fixed";
  }
  if (els.backdrop) {
    els.backdrop.style.pointerEvents = "auto";
    els.backdrop.style.zIndex = "9000";
    els.backdrop.style.position = "fixed";
  }

  bindOpen();
  bindCloseForce();

  toast(`已載入 v${BUILD_ID}`);
}

init();
