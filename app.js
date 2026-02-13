const BUILD_ID = window.BUILD_ID || "dev";
const $ = (id) => document.getElementById(id);
const bust = (path) => {
  const u = new URL(path, location.href);
  u.searchParams.set("v", BUILD_ID);
  return u.toString();
};

const LS = {
  theme: "reader:theme",
  font: "reader:fontSize",
  last: "reader:lastProgress",
  settings: "reader:settings",
};

const els = {
  // top
  nowTitle: $("nowTitle"),
  btnOpenLibrary: $("btnOpenLibrary"),
  btnOpenLibrary2: $("btnOpenLibrary2"),
  btnShare: $("btnShare"),
  btnOpenSettings: $("btnOpenSettings"),

  // pane/drawer
  pane: $("libraryPane"),
  overlay: $("overlay"),
  btnCloseLibrary: $("btnCloseLibrary"),
  btnCloseLibraryBottom: $("btnCloseLibraryBottom"),
  tabBooks: $("tabBooks"),
  tabChapters: $("tabChapters"),
  search: $("search"),
  bookList: $("bookList"),
  chapterList: $("chapterList"),
  buildId: $("buildId"),

  // main/player
  heroBook: $("heroBook"),
  heroChapter: $("heroChapter"),
  btnMain: $("btnMain"),
  btnRestart: $("btnRestart"),
  btnStop: $("btnStop"),
  metrics: $("metrics"),
  progress: $("progress"),
  sleepPill: $("sleepPill"),

  // text
  text: $("text"),
  btnPlayCursor: $("btnPlayCursor"),
  btnClear: $("btnClear"),
  where: $("where"),

  // settings modal
  settingsModal: $("settingsModal"),
  btnCloseSettings: $("btnCloseSettings"),
  btnDoneSettings: $("btnDoneSettings"),
  theme: $("theme"),
  fontSize: $("fontSize"),
  sleep: $("sleep"),
  sleepHint: $("sleepHint"),
  voice: $("voice"),
  rate: $("rate"),
  rateVal: $("rateVal"),
  vol: $("vol"),
  volVal: $("volVal"),
  pitch: $("pitch"),
  pitchVal: $("pitchVal"),
  langHint: $("langHint"),

  toast: $("toast"),
};

let library = null;
let currentBookMeta = null;
let currentBookData = null;
let currentChapter = null;

let segs = [];
let currentIndex = 0;
let isPlaying = false;
let isPaused = false;
let utter = null;

// sleep timer
let sleepEndAt = 0;
let sleepTick = null;

// in-pane view
let paneView = "books"; // books | chapters
let searchQuery = "";

/* ---------- UI helpers ---------- */
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add("hidden"), 1600);
}

function lockBody(lock) {
  document.body.style.overflow = lock ? "hidden" : "";
}

function isMobile() {
  return window.matchMedia("(max-width: 920px)").matches;
}

/* ---------- Drawer / Modal open close (穩定版) ---------- */
function openOverlay() {
  els.overlay.classList.remove("hidden");
  els.overlay.setAttribute("aria-hidden", "false");
}
function closeOverlay() {
  els.overlay.classList.add("hidden");
  els.overlay.setAttribute("aria-hidden", "true");
}

function openPane() {
  if (!isMobile()) return; // 桌機常駐，不需要 open
  els.pane.classList.add("open");
  els.pane.setAttribute("aria-hidden", "false");
  openOverlay();
  lockBody(true);
}
function closePane() {
  if (!isMobile()) return;
  els.pane.classList.remove("open");
  els.pane.setAttribute("aria-hidden", "true");
  closeOverlay();
  lockBody(false);
}
function togglePane() {
  if (!isMobile()) return;
  if (els.pane.classList.contains("open")) closePane();
  else openPane();
}

function openSettings() {
  els.settingsModal.classList.remove("hidden");
  els.settingsModal.setAttribute("aria-hidden", "false");
  openOverlay();
  lockBody(true);
}
function closeSettings() {
  els.settingsModal.classList.add("hidden");
  els.settingsModal.setAttribute("aria-hidden", "true");
  closeOverlay();
  lockBody(false);
}

/* ---------- Theme / Font ---------- */
function applyTheme(theme) {
  const t = (theme === "light") ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  els.theme.value = t;
  localStorage.setItem(LS.theme, t);
}
function applyFont(size) {
  const s = (size === "s" || size === "l") ? size : "m";
  document.documentElement.dataset.font = s;
  els.fontSize.value = s;
  localStorage.setItem(LS.font, s);
}

/* ---------- Voice ---------- */
function getVoices(){ return window.speechSynthesis?.getVoices?.() || []; }

function scoreVoice(v, langHint) {
  const name = (v.name || "").toLowerCase();
  const lang = (v.lang || "").toLowerCase();
  const hint = (langHint || "").toLowerCase();
  let s = 0;

  if (hint && lang === hint) s += 80;
  if (hint && lang.startsWith(hint.split("-")[0])) s += 40;

  if (lang.startsWith("zh-cn")) s += 60;
  if (lang.includes("cmn")) s += 55;
  if (lang.startsWith("zh")) s += 25;

  if (name.includes("mandarin") || name.includes("putonghua") || name.includes("普通")) s += 40;
  if (name.includes("enhanced") || name.includes("premium") || name.includes("neural")) s += 8;
  return s;
}

function populateVoices() {
  const voices = getVoices();
  els.voice.innerHTML = "";
  if (!voices.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（聲線載入中…）";
    els.voice.appendChild(opt);
    return;
  }

  const sorted = [...voices].sort((a,b)=> scoreVoice(b, els.langHint.value) - scoreVoice(a, els.langHint.value));
  for (const v of sorted) {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    els.voice.appendChild(opt);
  }
}

/* ---------- Sleep timer ---------- */
function fmtMMSS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
function setSleepTimer(minutes) {
  const m = Number(minutes || 0);
  if (sleepTick) { clearInterval(sleepTick); sleepTick = null; }
  sleepEndAt = 0;

  if (m <= 0) {
    els.sleepPill.classList.add("hidden");
    els.sleepHint.textContent = "未啟用";
    toast("已關閉睡眠計時");
    return;
  }

  sleepEndAt = Date.now() + m * 60 * 1000;
  els.sleepPill.classList.remove("hidden");
  els.sleepHint.textContent = `已啟用：${m} 分鐘`;

  const tick = () => {
    const remain = sleepEndAt - Date.now();
    if (remain <= 0) {
      stop(false);
      toast("睡眠計時到：已停止");
      els.sleep.value = "0";
      setSleepTimer(0);
      return;
    }
    els.sleepPill.textContent = `⏲ ${fmtMMSS(remain)}`;
  };
  tick();
  sleepTick = setInterval(tick, 1000);
  toast(`已設定睡眠計時：${m} 分鐘`);
}

/* ---------- Segmentation ---------- */
function splitTextWithOffsets(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const out = [];
  const maxLen = 220;
  const enders = new Set(["。","！","？","!","?","；",";","…","."]);
  let start = 0;

  function pushRange(s, e) {
    const raw = normalized.slice(s, e);
    const t = raw.trim();
    if (!t) return;

    if (t.length <= maxLen) { out.push({ text: t, start: s, end: e }); return; }

    const soft = /[，,、\s]+/g;
    let last = 0, m;
    const parts = [];
    while ((m = soft.exec(t)) !== null) {
      const cut = m.index + m[0].length;
      if (cut - last >= 80) { parts.push(t.slice(last, cut)); last = cut; }
    }
    parts.push(t.slice(last));

    for (const p of parts) {
      const pp = p.trim();
      if (!pp) continue;
      if (pp.length <= maxLen) out.push({ text: pp, start: s, end: e });
      else for (let i=0;i<pp.length;i+=maxLen) out.push({ text: pp.slice(i, i+maxLen), start: s, end: e });
    }
  }

  for (let i=0;i<normalized.length;i++){
    const ch = normalized[i];
    if (ch === "\n") { pushRange(start, i); start = i + 1; continue; }
    if (enders.has(ch)) { pushRange(start, i+1); start = i + 1; }
  }
  pushRange(start, normalized.length);
  return out;
}

function prepareSegments() {
  const t = els.text.value || "";
  segs = splitTextWithOffsets(t);
  currentIndex = Math.max(0, Math.min(currentIndex, segs.length));

  els.metrics.textContent = `字數：${t.length}｜內部分段：${segs.length || 0}`;
  els.progress.textContent = `${Math.min(currentIndex + (isPlaying ? 1 : 0), segs.length)} / ${segs.length}`;

  if (!segs.length) els.where.textContent = "—";
  else {
    const s = segs[Math.min(currentIndex, segs.length - 1)];
    els.where.textContent = `位置：${s.start}–${s.end}`;
  }

  updateMainButton();
}

/* ---------- Main button state ---------- */
function setMainLabel(label) {
  els.btnMain.textContent = label;
}
function updateMainButton() {
  els.btnStop.disabled = !(isPlaying || isPaused);
  els.btnRestart.disabled = !currentChapter || !segs.length;

  if (!segs.length) { setMainLabel("播放"); return; }
  if (!isPlaying && !isPaused) {
    setMainLabel((currentIndex > 0 && currentIndex < segs.length) ? "續播" : "播放");
    return;
  }
  if (isPlaying && !isPaused) { setMainLabel("暫停"); return; }
  if (isPlaying && isPaused) { setMainLabel("繼續"); return; }
}

/* ---------- TTS ---------- */
function makeUtterance(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = Number(els.rate.value || 1);
  u.volume = Number(els.vol.value || 1);
  u.pitch = Number(els.pitch.value || 1);

  const hint = els.langHint.value;
  if (hint) u.lang = hint;

  const chosen = getVoices().find(v => v.voiceURI === els.voice.value);
  if (chosen) u.voice = chosen;
  return u;
}

function speakFrom(index) {
  if (!("speechSynthesis" in window)) { toast("此瀏覽器不支援語音朗讀，建議用 Chrome/Edge。"); return; }
  if (!segs.length) prepareSegments();
  if (!segs.length) { toast("沒有可朗讀內容"); return; }

  currentIndex = Math.max(0, Math.min(index, segs.length - 1));
  window.speechSynthesis.cancel();

  isPlaying = true;
  isPaused = false;
  updateMainButton();

  const run = () => {
    if (currentIndex >= segs.length) {
      isPlaying = false;
      isPaused = false;
      currentIndex = 0;
      saveProgress();
      prepareSegments();
      toast("已朗讀完畢");
      return;
    }

    saveProgress();
    prepareSegments();

    utter = makeUtterance(segs[currentIndex].text);
    utter.onend = () => { if (isPlaying) { currentIndex += 1; run(); } };
    utter.onerror = () => { currentIndex += 1; run(); };
    window.speechSynthesis.speak(utter);
  };

  toast("開始朗讀");
  run();
}

function pause() {
  if (!isPlaying || isPaused) return;
  window.speechSynthesis.pause();
  isPaused = true;
  saveProgress();
  updateMainButton();
  toast("已暫停");
}
function resume() {
  if (!isPlaying || !isPaused) return;
  window.speechSynthesis.resume();
  isPaused = false;
  saveProgress();
  updateMainButton();
  toast("繼續朗讀");
}
function stop(showMsg = true) {
  window.speechSynthesis.cancel();
  isPlaying = false;
  isPaused = false;
  utter = null;
  saveProgress();
  prepareSegments();
  if (showMsg) toast("已停止");
}
function restartFromHead() {
  if (!segs.length) prepareSegments();
  currentIndex = 0;
  saveProgress();
  prepareSegments();
  toast("已回到開頭");
}
function playFromCursor() {
  const cursor = els.text.selectionStart ?? 0;
  if (!segs.length) prepareSegments();
  if (!segs.length) return;

  let idx = 0;
  for (let i=0;i<segs.length;i++){
    if (cursor >= segs[i].start && cursor <= segs[i].end) { idx = i; break; }
    if (cursor > segs[i].end) idx = i;
  }
  speakFrom(idx);
}
function onMainPressed() {
  if (!segs.length) prepareSegments();
  if (!segs.length) { toast("請先載入章節或貼上文字"); return; }

  if (!isPlaying && !isPaused) {
    const start = (currentIndex >= segs.length) ? 0 : currentIndex;
    speakFrom(start);
    return;
  }
  if (isPlaying && !isPaused) { pause(); return; }
  if (isPlaying && isPaused) { resume(); return; }
}

/* ---------- Progress memory ---------- */
function saveProgress() {
  if (!currentBookData?.id || !currentChapter?.id || !segs.length) return;
  const payload = {
    bookId: currentBookData.id,
    chId: currentChapter.id,
    index: Math.max(0, Math.min(currentIndex, segs.length)),
    at: Date.now()
  };
  try { localStorage.setItem(LS.last, JSON.stringify(payload)); } catch {}
}
function readProgress() {
  try {
    const raw = localStorage.getItem(LS.last);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.bookId || !obj?.chId) return null;
    return obj;
  } catch { return null; }
}

/* ---------- Data ---------- */
async function fetchJson(path) {
  const res = await fetch(bust(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`JSON 讀取失敗：${path}`);
  return await res.json();
}
async function fetchText(path) {
  const res = await fetch(bust(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`TXT 讀取失敗：${path}`);
  return await res.text();
}

/* ---------- Render ---------- */
function setPaneView(view) {
  paneView = view;

  const isBooks = view === "books";
  els.tabBooks.classList.toggle("active", isBooks);
  els.tabChapters.classList.toggle("active", !isBooks);
  els.tabBooks.setAttribute("aria-selected", String(isBooks));
  els.tabChapters.setAttribute("aria-selected", String(!isBooks));

  els.bookList.classList.toggle("hidden", !isBooks);
  els.chapterList.classList.toggle("hidden", isBooks);
}

function renderBooks(books) {
  els.bookList.innerHTML = "";
  if (!books.length) { els.bookList.textContent = "沒有書"; return; }

  books.forEach(b => {
    if (searchQuery && !(`${b.title||""} ${b.id||""}`.toLowerCase().includes(searchQuery))) return;

    const wrap = document.createElement("div");
    wrap.className = "item";
    const main = document.createElement("div");
    main.className = "itemMain";
    const t = document.createElement("div");
    t.className = "itemTitle";
    t.textContent = b.title || b.id;
    const s = document.createElement("div");
    s.className = "itemSub";
    s.textContent = "點選以載入章節";
    main.appendChild(t); main.appendChild(s);
    main.addEventListener("click", async () => {
      await openBook(b);
      setPaneView("chapters");
      if (isMobile()) openPane(); // 若手機已開抽屜，不動；若未開，保持使用者流程一致
    });
    wrap.appendChild(main);
    els.bookList.appendChild(wrap);
  });
}

function renderChapters(chapters) {
  els.chapterList.innerHTML = "";
  if (!chapters.length) { els.chapterList.textContent = "此書沒有章節"; return; }

  const sorted = [...chapters].sort((a,b)=> (a.order??0) - (b.order??0));
  sorted.forEach(ch => {
    if (searchQuery && !(`${ch.title||""} ${ch.id||""}`.toLowerCase().includes(searchQuery))) return;

    const wrap = document.createElement("div");
    wrap.className = "item";

    const main = document.createElement("div");
    main.className = "itemMain";

    const t = document.createElement("div");
    t.className = "itemTitle";
    t.textContent = ch.title || ch.id;

    const s = document.createElement("div");
    s.className = "itemSub";
    s.textContent = "點選載入並可立即播放";

    main.appendChild(t);
    main.appendChild(s);

    const btn = document.createElement("button");
    btn.className = "itemBtn";
    btn.textContent = "連結";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await copyShareFor(currentBookData?.id, ch.id);
    });

    main.addEventListener("click", async () => {
      await openChapter(ch, { autoplay: false, startIndex: 0, restored: false });
      if (isMobile()) closePane();
      toast("章節已載入");
    });

    wrap.appendChild(main);
    wrap.appendChild(btn);
    els.chapterList.appendChild(wrap);
  });
}

/* ---------- Open book/chapter ---------- */
async function loadLibrary() {
  library = await fetchJson("texts/library.json");
  renderBooks(library.books || []);
}

async function openBook(bookMeta) {
  stop(false);
  currentBookMeta = bookMeta;
  currentBookData = await fetchJson(bookMeta.manifest);

  els.tabChapters.disabled = false;
  renderChapters(currentBookData.chapters || []);
  els.nowTitle.textContent = currentBookData.title || bookMeta.title || "已選書";
  els.heroBook.textContent = currentBookData.title || bookMeta.title || "已選書";
  els.heroChapter.textContent = "請選擇章節";
}

async function openChapter(ch, { autoplay, startIndex, restored }) {
  stop(false);
  currentChapter = ch;

  const bookTitle = currentBookData?.title || currentBookMeta?.title || "書";
  const chTitle = ch.title || ch.id;

  els.nowTitle.textContent = `${bookTitle} / ${chTitle}`;
  els.heroBook.textContent = bookTitle;
  els.heroChapter.textContent = chTitle;

  const text = await fetchText(ch.file);
  els.text.value = text;

  segs = [];
  currentIndex = Number(startIndex || 0);
  prepareSegments();
  currentIndex = Math.max(0, Math.min(currentIndex, Math.max(0, segs.length - 1)));
  saveProgress();
  prepareSegments();

  // 更新 URL（書籤/分享）
  if (currentBookData?.id) {
    const url = new URL(location.href);
    url.searchParams.set("v", BUILD_ID);
    url.searchParams.set("book", currentBookData.id);
    url.searchParams.set("ch", ch.id);
    if (autoplay) url.searchParams.set("autoplay", "1");
    else url.searchParams.delete("autoplay");
    history.replaceState({}, "", url);
  }

  if (restored) toast("已恢復上次進度（可按續播）");

  if (autoplay) {
    toast("已載入文字：請點一下畫面開始朗讀");
    const once = () => speakFrom(0);
    window.addEventListener("pointerdown", once, { once: true });
    window.addEventListener("touchstart", once, { once: true, passive: true });
  }
}

/* ---------- Share ---------- */
async function copyShareFor(bookId, chId) {
  if (!bookId || !chId) { alert("請先選一本書並選一個章節。"); return; }
  const url = new URL(location.href);
  url.searchParams.set("v", BUILD_ID);
  url.searchParams.set("book", bookId);
  url.searchParams.set("ch", chId);
  url.searchParams.set("autoplay", "1");

  try {
    await navigator.clipboard.writeText(url.toString());
    toast("已複製播放連結");
  } catch {
    prompt("複製這個連結：", url.toString());
  }
}

async function copyCurrentShare() {
  if (!currentBookData?.id || !currentChapter?.id) {
    toast("請先選章節，再分享連結");
    if (isMobile()) openPane();
    return;
  }
  await copyShareFor(currentBookData.id, currentChapter.id);
}

/* ---------- URL preload / restore ---------- */
async function preloadFromQuery() {
  const params = new URLSearchParams(location.search);
  const bookId = params.get("book");
  const chId = params.get("ch");
  const autoplay = params.get("autoplay") === "1";
  if (!bookId || !chId) return false;

  if (!library) await loadLibrary();
  const bookMeta = (library.books || []).find(b => b.id === bookId);
  if (!bookMeta) { toast("找不到指定書"); return true; }

  await openBook(bookMeta);
  const ch = (currentBookData?.chapters || []).find(c => c.id === chId);
  if (!ch) { toast("找不到指定章節"); return true; }

  await openChapter(ch, { autoplay, startIndex: 0, restored: false });
  return true;
}

async function restoreLastIfAny() {
  const last = readProgress();
  if (!last) return;

  if (!library) await loadLibrary();
  const bookMeta = (library.books || []).find(b => b.id === last.bookId);
  if (!bookMeta) return;

  await openBook(bookMeta);
  const ch = (currentBookData?.chapters || []).find(c => c.id === last.chId);
  if (!ch) return;

  await openChapter(ch, { autoplay: false, startIndex: Number(last.index || 0), restored: true });
}

/* ---------- Bind events ---------- */
function bind() {
  els.buildId.textContent = BUILD_ID;

  // Open library
  els.btnOpenLibrary.addEventListener("click", () => {
    if (isMobile()) togglePane();
    else toast("書庫在左側");
  });
  els.btnOpenLibrary2.addEventListener("click", () => {
    if (isMobile()) openPane();
    else toast("書庫在左側");
  });

  // Close library (capture 讓任何層都能關)
  const closeHandler = (e) => { e.preventDefault(); e.stopPropagation(); closePane(); };
  els.btnCloseLibrary.addEventListener("pointerdown", closeHandler, { passive: false, capture: true });
  els.btnCloseLibraryBottom.addEventListener("pointerdown", closeHandler, { passive: false, capture: true });
  els.btnCloseLibrary.addEventListener("click", closeHandler, true);
  els.btnCloseLibraryBottom.addEventListener("click", closeHandler, true);

  // Overlay click closes (if pane open or settings open)
  els.overlay.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!els.settingsModal.classList.contains("hidden")) closeSettings();
    if (els.pane.classList.contains("open")) closePane();
  }, { passive: false });

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!els.settingsModal.classList.contains("hidden")) closeSettings();
    if (els.pane.classList.contains("open")) closePane();
  });

  // Tabs
  els.tabBooks.addEventListener("click", () => setPaneView("books"));
  els.tabChapters.addEventListener("click", () => setPaneView("chapters"));

  // Search
  els.search.addEventListener("input", () => {
    searchQuery = (els.search.value || "").trim().toLowerCase();
    renderBooks(library?.books || []);
    renderChapters(currentBookData?.chapters || []);
  });

  // Share
  els.btnShare.addEventListener("click", copyCurrentShare);

  // Settings
  els.btnOpenSettings.addEventListener("click", openSettings);
  els.btnCloseSettings.addEventListener("click", closeSettings);
  els.btnDoneSettings.addEventListener("click", closeSettings);

  // Settings values
  els.theme.addEventListener("change", () => applyTheme(els.theme.value));
  els.fontSize.addEventListener("change", () => applyFont(els.fontSize.value));
  els.sleep.addEventListener("change", () => setSleepTimer(els.sleep.value));

  els.rate.addEventListener("input", () => els.rateVal.textContent = Number(els.rate.value).toFixed(1));
  els.vol.addEventListener("input", () => els.volVal.textContent = Number(els.vol.value).toFixed(2));
  els.pitch.addEventListener("input", () => els.pitchVal.textContent = Number(els.pitch.value).toFixed(1));
  els.langHint.addEventListener("change", () => populateVoices());

  // Player
  els.btnMain.addEventListener("click", onMainPressed);
  els.btnStop.addEventListener("click", () => stop(true));
  els.btnRestart.addEventListener("click", restartFromHead);

  // Text actions
  els.btnPlayCursor.addEventListener("click", playFromCursor);
  els.btnClear.addEventListener("click", () => {
    stop(false);
    if (!confirm("確定清空文字？")) return;
    els.text.value = "";
    segs = [];
    currentIndex = 0;
    saveProgress();
    prepareSegments();
    toast("已清空");
  });

  els.text.addEventListener("input", () => {
    segs = [];
    currentIndex = 0;
    prepareSegments();
    saveProgress();
  });

  // Stop when hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(false);
  });

  // Responsive: if switching to desktop, ensure pane closed state doesn't matter
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      closeOverlay();
      lockBody(false);
      els.pane.classList.remove("open");
      els.pane.setAttribute("aria-hidden", "false");
    } else {
      els.pane.setAttribute("aria-hidden", els.pane.classList.contains("open") ? "false" : "true");
    }
  });
}

/* ---------- init ---------- */
async function init() {
  bind();

  // restore theme/font
  applyTheme(localStorage.getItem(LS.theme) || "dark");
  applyFont(localStorage.getItem(LS.font) || "m");

  // init slider labels
  els.rateVal.textContent = Number(els.rate.value).toFixed(1);
  els.volVal.textContent = Number(els.vol.value).toFixed(2);
  els.pitchVal.textContent = Number(els.pitch.value).toFixed(1);

  // voices
  if (!("speechSynthesis" in window)) toast("此瀏覽器不支援語音朗讀，建議用 Chrome/Edge。");
  else {
    populateVoices();
    window.speechSynthesis.onvoiceschanged = () => populateVoices();
  }

  await loadLibrary();
  setPaneView("books");

  const handled = await preloadFromQuery();
  if (!handled) await restoreLastIfAny();

  prepareSegments();
  updateMainButton();

  toast(`已載入 v${BUILD_ID}`);
}

init().catch((e) => {
  console.error(e);
  toast("初始化失敗：請檢查 texts/library.json 與各章節檔案路徑");
});
