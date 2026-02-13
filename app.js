/* 自建聽書書庫（公開 / 無登入）
 * - 書庫首頁：讀取 data/library.json
 * - 書籍頁：讀取 bookJsonPath 的章節清單
 * - 播放頁：HTML5 audio 串流、倍速、上一章/下一章、結束自動播下一章
 * - 續聽進度：本機 localStorage（每本書每章記到秒）
 * - 分享連結：hash route #/book/{id}, #/listen/{bookId}/{chapterId}
 */

const $ = (id) => document.getElementById(id);

const els = {
  viewLibrary: $("viewLibrary"),
  viewBook: $("viewBook"),
  viewListen: $("viewListen"),

  goHome: $("goHome"),
  btnInstall: $("btnInstall"),
  btnClearProgress: $("btnClearProgress"),

  searchInput: $("searchInput"),
  libraryGrid: $("libraryGrid"),
  libraryEmpty: $("libraryEmpty"),

  btnBackToLibrary: $("btnBackToLibrary"),
  btnShareBook: $("btnShareBook"),
  bookCover: $("bookCover"),
  bookTitle: $("bookTitle"),
  bookAuthor: $("bookAuthor"),
  bookLicense: $("bookLicense"),
  bookDesc: $("bookDesc"),
  bookSource: $("bookSource"),
  bookPDF: $("bookPDF"),
  btnResume: $("btnResume"),
  chapterList: $("chapterList"),

  btnBackToBook: $("btnBackToBook"),
  btnShareChapter: $("btnShareChapter"),
  listenBook: $("listenBook"),
  listenTitle: $("listenTitle"),
  listenMeta: $("listenMeta"),

  audio: $("audio"),
  btnPrevChapter: $("btnPrevChapter"),
  btnNextChapter: $("btnNextChapter"),
  speedSelect: $("speedSelect"),
  downloadLink: $("downloadLink"),
  playStatus: $("playStatus"),
};

const STORAGE_KEY = "library_player_v1";

let deferredPrompt = null;

const state = {
  library: null,     // library.json
  booksIndex: new Map(), // id -> book item
  currentBook: null, // book.json
  currentBookItem: null, // from library
  currentChapterIndex: 0,
  search: "",
  prefs: {
    speed: 1.0
  },
  progress: {
    // [bookId]: { chapterId, timeSec, updatedAt }
  }
};

function saveLocal() {
  const payload = {
    prefs: state.prefs,
    progress: state.progress
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    if (payload && typeof payload === "object") {
      state.prefs = payload.prefs || state.prefs;
      state.progress = payload.progress || state.progress;
    }
  } catch (_) {}
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed: ${path}`);
  return await res.json();
}

function show(view) {
  els.viewLibrary.hidden = view !== "library";
  els.viewBook.hidden = view !== "book";
  els.viewListen.hidden = view !== "listen";
}

function setPlayStatus(msg) {
  els.playStatus.textContent = msg;
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getHashParts() {
  const hash = location.hash || "#/";
  const clean = hash.replace(/^#\/?/, "");
  const parts = clean.split("/").filter(Boolean);
  return parts;
}

function setHash(path) {
  location.hash = path.startsWith("#") ? path : `#/${path}`;
}

function copyShareLink() {
  const url = location.href;
  navigator.clipboard?.writeText(url).then(() => {
    alert("已複製分享連結。");
  }).catch(() => {
    prompt("請手動複製連結：", url);
  });
}

/* ---------- Render: Library ---------- */
function renderLibrary() {
  show("library");

  const books = (state.library?.books || []).slice();

  const q = (state.search || "").trim().toLowerCase();
  const filtered = q
    ? books.filter(b => {
        const hay = `${b.title} ${b.author} ${(b.tags || []).join(" ")}`.toLowerCase();
        return hay.includes(q);
      })
    : books;

  els.libraryGrid.innerHTML = "";
  els.libraryEmpty.hidden = filtered.length !== 0;

  filtered.forEach(b => {
    const card = document.createElement("div");
    card.className = "cardItem";
    card.tabIndex = 0;

    const tags = (b.tags || []).slice(0, 6).map(t => `<span class="tag">${t}</span>`).join("");

    card.innerHTML = `
      <div class="cardTitle">${escapeHtml(b.title)}</div>
      <div class="cardMeta">${escapeHtml(b.author || "")} · ${escapeHtml(b.license || "")}</div>
      <div class="cardDesc">${escapeHtml(b.description || "")}</div>
      <div class="tags">${tags}</div>
    `;

    card.addEventListener("click", () => setHash(`book/${b.id}`));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") setHash(`book/${b.id}`);
    });

    els.libraryGrid.appendChild(card);
  });
}

/* ---------- Render: Book ---------- */
function renderBook(bookItem, bookJson) {
  show("book");

  state.currentBookItem = bookItem;
  state.currentBook = bookJson;

  els.bookTitle.textContent = bookJson.title || bookItem.title || "—";
  els.bookAuthor.textContent = bookJson.author || bookItem.author || "—";
  els.bookLicense.textContent = bookJson.license || bookItem.license || "—";
  els.bookDesc.textContent = bookJson.description || bookItem.description || "";

  // cover
  if (bookItem.coverUrl) {
    els.bookCover.style.background = `url(${bookItem.coverUrl}) center/cover no-repeat`;
  } else {
    els.bookCover.style.background = `linear-gradient(180deg, rgba(59,130,246,.25), rgba(34,197,94,.18))`;
  }

  // links
  const source = bookJson.sourceUrl || bookItem.sourceUrl || "";
  els.bookSource.href = source || "#";
  els.bookSource.style.pointerEvents = source ? "auto" : "none";
  els.bookSource.style.opacity = source ? "1" : ".5";

  const pdf = bookJson.pdfUrl || "";
  els.bookPDF.hidden = !pdf;
  if (pdf) els.bookPDF.href = pdf;

  // resume
  const saved = state.progress[bookItem.id];
  els.btnResume.disabled = !saved;
  els.btnResume.textContent = saved ? `從上次續聽（第 ${getChapterOrderText(bookJson, saved.chapterId)}）` : "從上次續聽";

  // chapters
  const chapters = (bookJson.chapters || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  els.chapterList.innerHTML = "";

  chapters.forEach((ch, idx) => {
    const row = document.createElement("div");
    row.className = "listItem";

    const dur = ch.durationSec ? formatTime(ch.durationSec) : "";
    const progressForBook = state.progress[bookItem.id];
    const isLast = progressForBook?.chapterId === ch.id;
    const hint = isLast ? `續聽：${formatTime(progressForBook.timeSec || 0)}` : "";

    row.innerHTML = `
      <div class="listLeft">
        <div class="listTitle">${escapeHtml(ch.title || `第 ${idx + 1} 章`)}</div>
        <div class="listSub">${dur ? `時長 ${dur}` : ""}${dur && hint ? " · " : ""}${hint}</div>
      </div>
      <div class="spacer"></div>
      <div class="listRight">
        <span class="pill">播放</span>
      </div>
    `;

    row.addEventListener("click", () => setHash(`listen/${bookItem.id}/${ch.id}`));
    els.chapterList.appendChild(row);
  });
}

function getChapterOrderText(bookJson, chapterId) {
  const chapters = (bookJson.chapters || []);
  const idx = chapters.findIndex(c => c.id === chapterId);
  return idx >= 0 ? String((chapters[idx].order ?? (idx + 1))) : "?";
}

/* ---------- Render: Listen ---------- */
function renderListen(bookItem, bookJson, chapterId) {
  show("listen");

  state.currentBookItem = bookItem;
  state.currentBook = bookJson;

  const chapters = (bookJson.chapters || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = chapters.findIndex(c => c.id === chapterId);
  state.currentChapterIndex = idx >= 0 ? idx : 0;

  const ch = chapters[state.currentChapterIndex];
  if (!ch) {
    alert("找不到章節。");
    setHash(`book/${bookItem.id}`);
    return;
  }

  els.listenBook.textContent = bookJson.title || bookItem.title || "—";
  els.listenTitle.textContent = ch.title || "—";
  els.listenMeta.textContent = `${bookJson.author || bookItem.author || ""} · ${bookJson.license || bookItem.license || ""}`;

  // audio
  els.audio.src = ch.audioUrl || "";
  els.downloadLink.href = ch.audioUrl || "#";
  // 注意：跨網域下載可能不一定成功，但至少能開啟音檔
  els.downloadLink.target = "_blank";
  els.downloadLink.rel = "noreferrer";

  // speed
  const speed = Number(state.prefs.speed || 1.0);
  els.speedSelect.value = String(speed);
  els.audio.playbackRate = speed;

  setPlayStatus("就緒");

  // restore progress (time)
  const saved = state.progress[bookItem.id];
  const shouldSeek = saved && saved.chapterId === ch.id && Number.isFinite(saved.timeSec) && saved.timeSec > 0;

  // metadata loaded -> seek
  els.audio.onloadedmetadata = () => {
    if (shouldSeek) {
      const t = Math.min(saved.timeSec, Math.max(0, els.audio.duration - 1));
      els.audio.currentTime = t;
      setPlayStatus(`已定位到 ${formatTime(t)}`);
    }
  };

  // auto-next
  els.audio.onended = () => {
    setPlayStatus("本章結束，準備播放下一章…");
    const next = state.currentChapterIndex + 1;
    if (next < chapters.length) {
      setHash(`listen/${bookItem.id}/${chapters[next].id}`);
    } else {
      setPlayStatus("已播放到最後一章。");
    }
  };

  // save progress (throttle)
  let lastSaveAt = 0;
  els.audio.ontimeupdate = () => {
    const now = Date.now();
    if (now - lastSaveAt < 5000) return; // 5 秒存一次
    lastSaveAt = now;

    state.progress[bookItem.id] = {
      chapterId: ch.id,
      timeSec: Math.floor(els.audio.currentTime || 0),
      updatedAt: now
    };
    saveLocal();
  };

  els.btnPrevChapter.disabled = state.currentChapterIndex <= 0;
  els.btnNextChapter.disabled = state.currentChapterIndex >= chapters.length - 1;
}

/* ---------- Router ---------- */
async function route() {
  const parts = getHashParts();

  if (!state.library) {
    await loadLibrary();
  }

  // default: library
  if (parts.length === 0) {
    renderLibrary();
    return;
  }

  const [page, a, b] = parts;

  if (page === "book" && a) {
    const bookId = a;
    const bookItem = state.booksIndex.get(bookId);
    if (!bookItem) {
      alert("找不到書籍。");
      setHash("");
      return;
    }
    const bookJson = await fetchJson(bookItem.bookJsonPath);
    renderBook(bookItem, bookJson);
    return;
  }

  if (page === "listen" && a && b) {
    const bookId = a;
    const chapterId = b;
    const bookItem = state.booksIndex.get(bookId);
    if (!bookItem) {
      alert("找不到書籍。");
      setHash("");
      return;
    }
    const bookJson = await fetchJson(bookItem.bookJsonPath);
    renderListen(bookItem, bookJson, chapterId);
    return;
  }

  renderLibrary();
}

/* ---------- Load Library ---------- */
async function loadLibrary() {
  try {
    state.library = await fetchJson("./data/library.json");
    state.booksIndex.clear();
    (state.library.books || []).forEach(b => state.booksIndex.set(b.id, b));
  } catch (e) {
    console.error(e);
    alert("讀取書庫失敗：請確認 data/library.json 存在且為有效 JSON。");
    state.library = { books: [] };
  }
}

/* ---------- Events ---------- */
function bindEvents() {
  window.addEventListener("hashchange", () => route().catch(console.error));

  els.goHome.addEventListener("click", () => setHash(""));
  els.goHome.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") setHash("");
  });

  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value || "";
    renderLibrary();
  });

  els.btnBackToLibrary.addEventListener("click", () => setHash(""));
  els.btnBackToBook.addEventListener("click", () => {
    const id = state.currentBookItem?.id;
    if (id) setHash(`book/${id}`);
    else setHash("");
  });

  els.btnShareBook.addEventListener("click", copyShareLink);
  els.btnShareChapter.addEventListener("click", copyShareLink);

  els.btnResume.addEventListener("click", () => {
    const bookId = state.currentBookItem?.id;
    if (!bookId) return;

    const saved = state.progress[bookId];
    if (!saved?.chapterId) return;

    setHash(`listen/${bookId}/${saved.chapterId}`);
  });

  els.speedSelect.addEventListener("change", () => {
    const v = Number(els.speedSelect.value);
    state.prefs.speed = v;
    els.audio.playbackRate = v;
    saveLocal();
  });

  els.btnPrevChapter.addEventListener("click", () => {
    const bookId = state.currentBookItem?.id;
    const bookJson = state.currentBook;
    if (!bookId || !bookJson) return;

    const chapters = (bookJson.chapters || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const prev = state.currentChapterIndex - 1;
    if (prev >= 0) setHash(`listen/${bookId}/${chapters[prev].id}`);
  });

  els.btnNextChapter.addEventListener("click", () => {
    const bookId = state.currentBookItem?.id;
    const bookJson = state.currentBook;
    if (!bookId || !bookJson) return;

    const chapters = (bookJson.chapters || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const next = state.currentChapterIndex + 1;
    if (next < chapters.length) setHash(`listen/${bookId}/${chapters[next].id}`);
  });

  els.btnClearProgress.addEventListener("click", () => {
    if (!confirm("確定要清除本機續聽進度？")) return;
    state.progress = {};
    saveLocal();
    alert("已清除。");
    // 若在書籍頁，更新提示
    const parts = getHashParts();
    if (parts[0] === "book") route().catch(console.error);
  });

  // PWA install
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    els.btnInstall.hidden = false;
  });
  els.btnInstall.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.btnInstall.hidden = true;
  });
}

/* ---------- helpers ---------- */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- init ---------- */
async function init() {
  loadLocal();
  // speed init
  els.speedSelect.value = String(Number(state.prefs.speed || 1.0));
  bindEvents();
  await route();

  // register SW (保持你原本 PWA)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
  }
}

init().catch(console.error);
