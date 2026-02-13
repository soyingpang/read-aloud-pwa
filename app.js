const BUILD_ID = window.BUILD_ID || "dev";
const $ = (id) => document.getElementById(id);
const bust = (path) => {
  const u = new URL(path, location.href);
  u.searchParams.set("v", BUILD_ID);
  return u.toString();
};

const LS = {
  font: "reader:fontSize",
  last: "reader:lastProgress"
};

const els = {
  nowTitle: $("nowTitle"),
  heroBook: $("heroBook"),
  heroChapter: $("heroChapter"),
  metrics: $("metrics"),
  progress: $("progress"),
  sleepPill: $("sleepPill"),
  sleepHint: $("sleepHint"),
  where: $("where"),

  text: $("text"),
  textPanel: $("textPanel"),
  btnClear: $("btnClear"),
  btnRestart: $("btnRestart"),

  btnPlay: $("btnPlay"),
  btnPause: $("btnPause"),
  btnResume: $("btnResume"),
  btnStop: $("btnStop"),

  voice: $("voice"),
  rate: $("rate"),
  rateVal: $("rateVal"),
  vol: $("vol"),
  volVal: $("volVal"),
  pitch: $("pitch"),
  pitchVal: $("pitchVal"),
  langHint: $("langHint"),

  fontSeg: $("fontSeg"),
  sleepSeg: $("sleepSeg"),

  btnOpenLibrary: $("btnOpenLibrary"),
  btnOpenLibrary2: $("btnOpenLibrary2"),
  btnCloseLibrary: $("btnCloseLibrary"),
  btnCopyShareTop: $("btnCopyShareTop"),
  sheetBackdrop: $("sheetBackdrop"),
  librarySheet: $("librarySheet"),
  tabBooks: $("tabBooks"),
  tabChapters: $("tabChapters"),
  bookList: $("bookList"),
  chapterList: $("chapterList"),

  toast: $("toast")
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

// sleep timer state
let sleepEndAt = 0;
let sleepTick = null;

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 2000);
}
function setStatus(msg) { showToast(msg); }

function setButtons() {
  els.btnPause.disabled = !isPlaying || isPaused;
  els.btnResume.disabled = !isPlaying || !isPaused;
  els.btnStop.disabled = !isPlaying && !isPaused;
  els.btnPlay.disabled = isPlaying && !isPaused;
  els.btnRestart.disabled = !currentChapter || segs.length === 0;
  updatePlayLabel();
}

function updatePlayLabel() {
  if (!segs.length) { els.btnPlay.textContent = "播放"; return; }
  if (currentIndex > 0 && currentIndex < segs.length) els.btnPlay.textContent = "續播";
  else els.btnPlay.textContent = "播放";
}

function updateMetrics() {
  const t = els.text.value || "";
  els.metrics.textContent = `字數：${t.length}｜內部分段：${segs.length || 0}`;
}

function updateProgress() {
  els.progress.textContent = `${Math.min(currentIndex + (isPlaying ? 1 : 0), segs.length)} / ${segs.length}`;
  if (!segs.length) { els.where.textContent = "—"; return; }
  const s = segs[Math.min(currentIndex, segs.length - 1)];
  els.where.textContent = s ? `位置：${s.start}–${s.end}` : "—";
}

/* ---------------- 字體大小 ---------------- */
function applyFont(size) {
  const s = (size === "s" || size === "l") ? size : "m";
  document.documentElement.dataset.font = s;
  localStorage.setItem(LS.font, s);
  highlightSeg(els.fontSeg, "data-font", s);
}

function highlightSeg(segEl, attr, value) {
  if (!segEl) return;
  const btns = [...segEl.querySelectorAll(".segBtn")];
  btns.forEach(b => b.classList.toggle("active", b.getAttribute(attr) === String(value)));
}

/* ---------------- 睡眠計時 ---------------- */
function fmtMMSS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function clearSleepTimerUI() {
  els.sleepPill.classList.add("hidden");
  els.sleepPill.textContent = "⏲ --:--";
  els.sleepHint.textContent = "未啟用";
}

function setSleepTimer(minutes) {
  const m = Number(minutes || 0);

  if (sleepTick) {
    clearInterval(sleepTick);
    sleepTick = null;
  }
  sleepEndAt = 0;

  highlightSeg(els.sleepSeg, "data-sleep", String(m));

  if (m <= 0) {
    clearSleepTimerUI();
    setStatus("已關閉睡眠計時");
    return;
  }

  sleepEndAt = Date.now() + m * 60 * 1000;
  els.sleepPill.classList.remove("hidden");
  els.sleepHint.textContent = `已啟用：${m} 分鐘`;

  const tick = () => {
    const remain = sleepEndAt - Date.now();
    if (remain <= 0) {
      // 到點：停止播放 + 關閉計時
      stop(false);
      setStatus("睡眠計時到：已停止");
      setSleepTimer(0);
      return;
    }
    els.sleepPill.textContent = `⏲ ${fmtMMSS(remain)}`;
  };

  tick();
  sleepTick = setInterval(tick, 1000);
  setStatus(`已設定睡眠計時：${m} 分鐘`);
}

/* ---------------- 進度記憶（章節+位置） ---------------- */
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

/* -------- Voice -------- */
function getVoices() { return window.speechSynthesis?.getVoices?.() || []; }
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
  const sorted = [...voices].sort((a, b) => scoreVoice(b, els.langHint.value) - scoreVoice(a, els.langHint.value));
  for (const v of sorted) {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    els.voice.appendChild(opt);
  }
}

/* -------- Internal segmentation -------- */
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

    if (t.length <= maxLen) {
      out.push({ text: t, start: s, end: e });
      return;
    }

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
      else {
        for (let i = 0; i < pp.length; i += maxLen) {
          out.push({ text: pp.slice(i, i + maxLen), start: s, end: e });
        }
      }
    }
  }

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === "\n") { pushRange(start, i); start = i + 1; continue; }
    if (enders.has(ch)) { pushRange(start, i + 1); start = i + 1; }
  }
  pushRange(start, normalized.length);
  return out;
}

function prepareSegments() {
  const t = els.text.value || "";
  segs = splitTextWithOffsets(t);
  currentIndex = Math.max(0, Math.min(currentIndex, segs.length));
  updateMetrics();
  updateProgress();
  setButtons();
}

/* -------- TTS -------- */
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
  if (!("speechSynthesis" in window)) { setStatus("此瀏覽器不支援語音朗讀，建議用 Chrome/Edge。"); return; }

  if (!segs.length) prepareSegments();
  if (!segs.length) { setStatus("沒有可朗讀內容"); return; }

  currentIndex = Math.max(0, Math.min(index, segs.length - 1));
  updateProgress();

  window.speechSynthesis.cancel();

  isPlaying = true;
  isPaused = false;
  setButtons();

  const run = () => {
    if (currentIndex >= segs.length) {
      isPlaying = false;
      isPaused = false;
      setButtons();
      setStatus("已朗讀完畢");
      // 朗讀完畢後，把位置回到 0，避免下次續播卡在尾端
      currentIndex = 0;
      saveProgress();
      updateProgress();
      setButtons();
      return;
    }

    // 每段開始就存進度（即使中途重整也能續）
    saveProgress();
    updateProgress();

    utter = makeUtterance(segs[currentIndex].text);
    utter.onend = () => { if (isPlaying) { currentIndex += 1; run(); } };
    utter.onerror = () => { currentIndex += 1; run(); };

    window.speechSynthesis.speak(utter);
  };

  setStatus("開始朗讀");
  run();
}

function pause() {
  if (!isPlaying) return;
  window.speechSynthesis.pause();
  isPaused = true;
  saveProgress();
  setButtons();
  setStatus("已暫停");
}

function resume() {
  if (!isPlaying) return;
  window.speechSynthesis.resume();
  isPaused = false;
  saveProgress();
  setButtons();
  setStatus("繼續朗讀");
}

function stop(showMsg = true) {
  window.speechSynthesis.cancel();
  isPlaying = false;
  isPaused = false;
  utter = null;
  saveProgress();
  setButtons();
  updateProgress();
  if (showMsg) setStatus("已停止");
}

function restartFromHead() {
  if (!segs.length) prepareSegments();
  currentIndex = 0;
  saveProgress();
  updateProgress();
  setButtons();
  setStatus("已回到開頭");
}

/* -------- Sheet UI -------- */
function openSheet(tab = "books") {
  els.sheetBackdrop.classList.remove("hidden");
  els.librarySheet.classList.remove("hidden");
  setTab(tab);
}
function closeSheet() {
  els.sheetBackdrop.classList.add("hidden");
  els.librarySheet.classList.add("hidden");
}
function setTab(tab) {
  const isBooks = tab === "books";
  els.tabBooks.classList.toggle("active", isBooks);
  els.tabChapters.classList.toggle("active", !isBooks);
  els.bookList.classList.toggle("hidden", !isBooks);
  els.chapterList.classList.toggle("hidden", isBooks);
}

/* -------- Data loading -------- */
async function fetchJson(path) {
  const res = await fetch(bust(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`JSON讀取失敗：${path}`);
  return await res.json();
}
async function fetchText(path) {
  const res = await fetch(bust(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`TXT讀取失敗：${path}`);
  return await res.text();
}

function renderBooks(books) {
  els.bookList.innerHTML = "";
  if (!books.length) { els.bookList.textContent = "沒有書"; return; }

  books.forEach(b => {
    const wrap = document.createElement("div");
    wrap.className = "item";

    const main = document.createElement("div");
    main.className = "itemMain";

    const title = document.createElement("div");
    title.className = "itemTitle";
    title.textContent = b.title || b.id;

    const sub = document.createElement("div");
    sub.className = "itemSub";
    sub.textContent = "點選以載入章節";

    main.appendChild(title);
    main.appendChild(sub);

    main.addEventListener("click", async () => {
      await openBook(b);
      setTab("chapters");
    });

    wrap.appendChild(main);
    els.bookList.appendChild(wrap);
  });
}

function renderChapters(chapters) {
  els.chapterList.innerHTML = "";
  if (!chapters.length) { els.chapterList.textContent = "此書沒有章節"; return; }

  const sorted = [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  sorted.forEach(ch => {
    const wrap = document.createElement("div");
    wrap.className = "item";

    const main = document.createElement("div");
    main.className = "itemMain";

    const title = document.createElement("div");
    title.className = "itemTitle";
    title.textContent = ch.title || ch.id;

    const sub = document.createElement("div");
    sub.className = "itemSub";
    sub.textContent = "點選載入，底部可播放/續播";

    main.appendChild(title);
    main.appendChild(sub);

    const btn = document.createElement("button");
    btn.className = "itemBtn";
    btn.textContent = "連結";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await copyShareFor(currentBookData?.id, ch.id);
    });

    main.addEventListener("click", async () => {
      await openChapter(ch, { autoplay: false, startIndex: 0, restored: false });
      closeSheet();
      setStatus("章節已載入");
    });

    wrap.appendChild(main);
    wrap.appendChild(btn);
    els.chapterList.appendChild(wrap);
  });
}

async function loadLibrary() {
  library = await fetchJson("texts/library.json");
  renderBooks(library.books || []);
}

async function openBook(bookMeta) {
  stop(false);
  currentBookMeta = bookMeta;
  currentBookData = await fetchJson(bookMeta.manifest);
  renderChapters(currentBookData.chapters || []);
  els.heroBook.textContent = currentBookData.title || bookMeta.title || "已選書";
  els.heroChapter.textContent = "請選擇章節";
  els.nowTitle.textContent = currentBookData.title || bookMeta.title || "已選書";
  els.btnRestart.disabled = true;
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
  updateProgress();
  saveProgress();
  setButtons();

  // 更新網址（可書籤/分享）
  if (currentBookData?.id) {
    const url = new URL(location.href);
    url.searchParams.set("v", BUILD_ID);
    url.searchParams.set("book", currentBookData.id);
    url.searchParams.set("ch", ch.id);
    url.searchParams.delete("autoplay");
    url.searchParams.delete("file");
    history.replaceState({}, "", url);
  }

  els.btnRestart.disabled = false;

  if (restored) setStatus("已恢復上次進度，按「續播」開始");
  if (autoplay) {
    setStatus("已載入文字：請點一下畫面開始朗讀");
    const once = () => speakFrom(0); // 分享連結預設從頭播
    window.addEventListener("pointerdown", once, { once: true });
  }
}

async function preloadFromQuery() {
  const params = new URLSearchParams(location.search);
  const bookId = params.get("book");
  const chId = params.get("ch");
  const autoplay = params.get("autoplay") === "1";

  if (!bookId || !chId) return false;

  if (!library) await loadLibrary();
  const bookMeta = (library.books || []).find(b => b.id === bookId);
  if (!bookMeta) { setStatus("找不到指定書"); return true; }

  await openBook(bookMeta);

  const ch = (currentBookData?.chapters || []).find(c => c.id === chId);
  if (!ch) { setStatus("找不到指定章節"); return true; }

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

/* -------- Share -------- */
async function copyShareFor(bookId, chId) {
  if (!bookId || !chId) { alert("請先選一本書並選一個章節。"); return; }
  const url = new URL(location.href);
  url.searchParams.set("v", BUILD_ID);
  url.searchParams.set("book", bookId);
  url.searchParams.set("ch", chId);
  url.searchParams.set("autoplay", "1");
  url.searchParams.delete("file");
  await navigator.clipboard.writeText(url.toString());
  setStatus("已複製播放連結");
}

async function copyCurrentShare() {
  if (!currentBookData?.id || !currentChapter?.id) {
    openSheet(currentBookData ? "chapters" : "books");
    setStatus("請先選章節，再分享連結");
    return;
  }
  await copyShareFor(currentBookData.id, currentChapter.id);
}

/* -------- Bind -------- */
function bind() {
  // Sheet
  els.btnOpenLibrary.addEventListener("click", () => openSheet("books"));
  els.btnOpenLibrary2.addEventListener("click", () => openSheet("books"));
  els.btnCloseLibrary.addEventListener("click", closeSheet);
  els.sheetBackdrop.addEventListener("click", closeSheet);
  els.tabBooks.addEventListener("click", () => setTab("books"));
  els.tabChapters.addEventListener("click", () => setTab("chapters"));

  // Share
  els.btnCopyShareTop.addEventListener("click", copyCurrentShare);

  // Player
  els.btnPlay.addEventListener("click", () => {
    if (!segs.length) prepareSegments();
    // 續播：從 currentIndex 開始；若在尾端就從頭
    const start = (currentIndex >= segs.length) ? 0 : currentIndex;
    speakFrom(start);
  });
  els.btnPause.addEventListener("click", pause);
  els.btnResume.addEventListener("click", resume);
  els.btnStop.addEventListener("click", () => stop(true));

  // Restart
  els.btnRestart.addEventListener("click", restartFromHead);

  // Clear
  els.btnClear.addEventListener("click", () => {
    stop(false);
    if (!confirm("確定清空文字？")) return;
    els.text.value = "";
    segs = [];
    currentIndex = 0;
    updateMetrics();
    updateProgress();
    setButtons();
    setStatus("已清空");
  });

  // Settings
  els.rate.addEventListener("input", () => els.rateVal.textContent = Number(els.rate.value).toFixed(1));
  els.vol.addEventListener("input", () => els.volVal.textContent = Number(els.vol.value).toFixed(2));
  els.pitch.addEventListener("input", () => els.pitchVal.textContent = Number(els.pitch.value).toFixed(1));
  els.langHint.addEventListener("change", () => populateVoices());

  // Font seg
  els.fontSeg.addEventListener("click", (e) => {
    const btn = e.target.closest(".segBtn");
    if (!btn) return;
    const font = btn.getAttribute("data-font");
    applyFont(font);
    setStatus(`字體已切換：${font === "s" ? "小" : font === "l" ? "大" : "中"}`);
  });

  // Sleep seg
  els.sleepSeg.addEventListener("click", (e) => {
    const btn = e.target.closest(".segBtn");
    if (!btn) return;
    const m = btn.getAttribute("data-sleep");
    setSleepTimer(m);
  });

  // Text input
  els.text.addEventListener("input", () => {
    segs = [];
    currentIndex = 0;
    prepareSegments();
    saveProgress();
  });

  // Background stop
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(false);
  });

  // Before unload save
  window.addEventListener("beforeunload", () => saveProgress());
}

async function init() {
  bind();

  // font restore
  const f = localStorage.getItem(LS.font) || "m";
  applyFont(f);

  // sleep default off
  highlightSeg(els.sleepSeg, "data-sleep", "0");
  clearSleepTimerUI();

  els.rateVal.textContent = Number(els.rate.value).toFixed(1);
  els.volVal.textContent = Number(els.vol.value).toFixed(2);
  els.pitchVal.textContent = Number(els.pitch.value).toFixed(1);

  if (!("speechSynthesis" in window)) {
    setStatus("此瀏覽器不支援語音朗讀，建議用 Chrome/Edge。");
  } else {
    populateVoices();
    window.speechSynthesis.onvoiceschanged = () => populateVoices();
  }

  updateMetrics();
  updateProgress();
  setButtons();

  await loadLibrary();

  // 如果 URL 指定章節，就以 URL 為準；否則恢復上次進度
  const handled = await preloadFromQuery();
  if (!handled) await restoreLastIfAny();
}

init().catch(() => setStatus("初始化失敗：請檢查檔案路徑與 JSON 格式"));
