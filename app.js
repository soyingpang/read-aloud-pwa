const BUILD_ID = window.BUILD_ID || "dev";
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
  // hero / status
  nowTitle: $("nowTitle"),
  heroBook: $("heroBook"),
  heroChapter: $("heroChapter"),
  metrics: $("metrics"),
  progress: $("progress"),
  sleepPill: $("sleepPill"),
  sleepHint: $("sleepHint"),
  where: $("where"),

  // controls
  btnMainHero: $("btnMainHero"),
  btnRestart: $("btnRestart"),
  btnOpenLibrary: $("btnOpenLibrary"),
  btnOpenLibrary2: $("btnOpenLibrary2"),
  btnCopyShareTop: $("btnCopyShareTop"),
  btnClear: $("btnClear"),
  btnPlayCursor: $("btnPlayCursor"),

  // bottom bar
  bbLibrary: $("bbLibrary"),
  bbMain: $("bbMain"),
  bbStop: $("bbStop"),
  bbSettings: $("bbSettings"),

  // panels
  settingsPanel: $("settingsPanel"),

  // text
  text: $("text"),

  // segments
  fontSeg: $("fontSeg"),
  sleepSeg: $("sleepSeg"),

  // voice
  voice: $("voice"),
  rate: $("rate"),
  rateVal: $("rateVal"),
  vol: $("vol"),
  volVal: $("volVal"),
  pitch: $("pitch"),
  pitchVal: $("pitchVal"),
  langHint: $("langHint"),

  // sheet
  sheetBackdrop: $("sheetBackdrop"),
  librarySheet: $("librarySheet"),
  btnCloseLibrary: $("btnCloseLibrary"),
  btnCloseLibraryBottom: $("btnCloseLibraryBottom"),
  tabBooks: $("tabBooks"),
  tabChapters: $("tabChapters"),
  bookList: $("bookList"),
  chapterList: $("chapterList"),

  // toast
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

/* ---------------- Toast ---------------- */
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 1800);
}
function setStatus(msg) { showToast(msg); }

/* ---------------- Helpers ---------------- */
function highlightSeg(segEl, attr, value) {
  if (!segEl) return;
  [...segEl.querySelectorAll(".segBtn")].forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute(attr) === String(value));
  });
}

/* ---------------- Font ---------------- */
function applyFont(size) {
  const s = (size === "s" || size === "l") ? size : "m";
  document.documentElement.dataset.font = s;
  localStorage.setItem(LS.font, s);
  highlightSeg(els.fontSeg, "data-font", s);
}

/* ---------------- Sleep timer ---------------- */
function fmtMMSS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
function clearSleepUI() {
  els.sleepPill.classList.add("hidden");
  els.sleepPill.textContent = "⏲ --:--";
  els.sleepHint.textContent = "未啟用";
}
function setSleepTimer(minutes) {
  const m = Number(minutes || 0);

  if (sleepTick) { clearInterval(sleepTick); sleepTick = null; }
  sleepEndAt = 0;

  highlightSeg(els.sleepSeg, "data-sleep", String(m));

  if (m <= 0) {
    clearSleepUI();
    setStatus("已關閉睡眠計時");
    return;
  }

  sleepEndAt = Date.now() + m * 60 * 1000;
  els.sleepPill.classList.remove("hidden");
  els.sleepHint.textContent = `已啟用：${m} 分鐘`;

  const tick = () => {
    const remain = sleepEndAt - Date.now();
    if (remain <= 0) {
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

/* ---------------- Progress memory ---------------- */
function saveProgress() {
  if (!currentBookData?.id || !currentChapter?.id || !segs.length) return;
  const payload = {
    bookId: currentBookData.id,
    chId: currentChapter.id,
    index: Math.max(0, Math.min(currentIndex, segs.length)),
    at: Date.now(),
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

/* ---------------- Voice ---------------- */
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

/* ---------------- Segmentation ---------------- */
function splitTextWithOffsets(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const out = [];
  const maxLen = 220;
  const enders = new Set(["。", "！", "？", "!", "?", "；", ";", "…", "."]);
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

function updateMainButtons() {
  // stop enabled?
  els.bbStop.disabled = !(isPlaying || isPaused);
  els.btnRestart.disabled = !currentChapter || !segs.length;

  // label state
  let label = "播放";
  let icon = "▶︎";

  if (!segs.length) {
    label = "播放";
    icon = "▶︎";
  } else if (!isPlaying && !isPaused) {
    if (currentIndex > 0 && currentIndex < segs.length) label = "續播";
    else label = "播放";
    icon = "▶︎";
  } else if (isPlaying && !isPaused) {
    label = "暫停";
    icon = "⏸";
  } else if (isPlaying && isPaused) {
    label = "繼續";
    icon = "▶︎";
  }

  els.btnMainHero.textContent = label;
  els.bbMain.querySelector(".bbText").textContent = label;
  els.bbMain.querySelector(".bbIcon").textContent = icon;
}

function prepareSegments() {
  const t = els.text.value || "";
  segs = splitTextWithOffsets(t);
  currentIndex = Math.max(0, Math.min(currentIndex, segs.length));

  els.metrics.textContent = `字數：${t.length}｜內部分段：${segs.length || 0}`;
  els.progress.textContent = `${Math.min(currentIndex + (isPlaying ? 1 : 0), segs.length)} / ${segs.length}`;

  if (!segs.length) {
    els.where.textContent = "—";
  } else {
    const s = segs[Math.min(currentIndex, segs.length - 1)];
    els.where.textContent = `位置：${s.start}–${s.end}`;
  }

  updateMainButtons();
}

/* ---------------- TTS ---------------- */
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
  if (!("speechSynthesis" in window)) {
    setStatus("此瀏覽器不支援語音朗讀，建議用 Chrome/Edge。");
    return;
  }
  if (!segs.length) prepareSegments();
  if (!segs.length) { setStatus("沒有可朗讀內容"); return; }

  currentIndex = Math.max(0, Math.min(index, segs.length - 1));
  window.speechSynthesis.cancel();

  isPlaying = true;
  isPaused = false;
  updateMainButtons();

  const run = () => {
    if (currentIndex >= segs.length) {
      isPlaying = false;
      isPaused = false;
      currentIndex = 0;
      saveProgress();
      prepareSegments();
      setStatus("已朗讀完畢");
      return;
    }

    saveProgress();
    prepareSegments();

    utter = makeUtterance(segs[currentIndex].text);
    utter.onend = () => { if (isPlaying) { currentIndex += 1; run(); } };
    utter.onerror = () => { currentIndex += 1; run(); };
    window.speechSynthesis.speak(utter);
  };

  setStatus("開始朗讀");
  run();
}

function pause() {
  if (!isPlaying || isPaused) return;
  window.speechSynthesis.pause();
  isPaused = true;
  saveProgress();
  updateMainButtons();
  setStatus("已暫停");
}

function resume() {
  if (!isPlaying || !isPaused) return;
  window.speechSynthesis.resume();
  isPaused = false;
  saveProgress();
  updateMainButtons();
  setStatus("繼續朗讀");
}

function stop(showMsg = true) {
  window.speechSynthesis.cancel();
  isPlaying = false;
  isPaused = false;
  utter = null;
  saveProgress();
  prepareSegments();
  if (showMsg) setStatus("已停止");
}

function restartFromHead() {
  if (!segs.length) prepareSegments();
  currentIndex = 0;
  saveProgress();
  prepareSegments();
  setStatus("已回到開頭");
}

function playFromCursor() {
  const cursor = els.text.selectionStart ?? 0;
  if (!segs.length) prepareSegments();
  if (!segs.length) return;

  let idx = 0;
  for (let i = 0; i < segs.length; i++) {
    if (cursor >= segs[i].start && cursor <= segs[i].end) { idx = i; break; }
    if (cursor > segs[i].end) idx = i;
  }
  speakFrom(idx);
}

function onMainPressed() {
  if (!segs.length) prepareSegments();
  if (!segs.length) { setStatus("請先載入章節或貼上文字"); return; }

  if (!isPlaying && !isPaused) {
    const start = (currentIndex >= segs.length) ? 0 : currentIndex;
    speakFrom(start);
    return;
  }
  if (isPlaying && !isPaused) { pause(); return; }
  if (isPlaying && isPaused) { resume(); return; }
}

/* ---------------- Sheet open/close (完整修正) ---------------- */
function isSheetOpen() {
  return !els.librarySheet.classList.contains("hidden");
}

function openSheet(tab = "books") {
  els.sheetBackdrop.classList.remove("hidden");
  els.librarySheet.classList.remove("hidden");
  setTab(tab);

  // 防止背景滾動造成點擊錯位
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  els.sheetBackdrop.classList.add("hidden");
  els.librarySheet.classList.add("hidden");

  document.body.style.overflow = "";
}

function toggleSheet(tab = "books") {
  if (isSheetOpen()) closeSheet();
  else openSheet(tab);
}

function bindClose(el) {
  if (!el) return;
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeSheet();
  };
  el.addEventListener("pointerdown", handler, { passive: false });
  el.addEventListener("touchstart", handler, { passive: false });
  el.addEventListener("click", handler);
}

function setTab(tab) {
  const isBooks = tab === "books";
  els.tabBooks.classList.toggle("active", isBooks);
  els.tabChapters.classList.toggle("active", !isBooks);
  els.bookList.classList.toggle("hidden", !isBooks);
  els.chapterList.classList.toggle("hidden", isBooks);
}

/* ---------------- Data loading ---------------- */
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
  if (!books.length) {
    els.bookList.textContent = "沒有書";
    return;
  }

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
  if (!chapters.length) {
    els.chapterList.textContent = "此書沒有章節";
    return;
  }

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
    sub.textContent = "點選載入；底部可播放/暫停/繼續";

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
    url.searchParams.delete("autoplay");
    history.replaceState({}, "", url);
  }

  if (restored) setStatus("已恢復上次進度（可按續播）");

  if (autoplay) {
    setStatus("已載入文字：請點一下畫面開始朗讀");
    const once = () => speakFrom(0);
    window.addEventListener("pointerdown", once, { once: true });
    window.addEventListener("touchstart", once, { once: true, passive: true });
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

/* ---------------- Share ---------------- */
async function copyShareFor(bookId, chId) {
  if (!bookId || !chId) { alert("請先選一本書並選一個章節。"); return; }
  const url = new URL(location.href);
  url.searchParams.set("v", BUILD_ID);
  url.searchParams.set("book", bookId);
  url.searchParams.set("ch", chId);
  url.searchParams.set("autoplay", "1");
  await navigator.clipboard.writeText(url.toString());
  setStatus("已複製播放連結");
}

async function copyCurrentShare() {
  if (!currentBookData?.id || !currentChapter?.id) {
    toggleSheet(currentBookData ? "chapters" : "books");
    setStatus("請先選章節，再分享連結");
    return;
  }
  await copyShareFor(currentBookData.id, currentChapter.id);
}

/* ---------------- Bind ---------------- */
function bind() {
  // sheet open (toggle)
  els.btnOpenLibrary.addEventListener("click", () => toggleSheet("books"));
  els.btnOpenLibrary2.addEventListener("click", () => toggleSheet("books"));
  els.bbLibrary.addEventListener("click", () => toggleSheet("books"));

  // sheet close (強制 pointerdown/touchstart)
  bindClose(els.btnCloseLibrary);
  bindClose(els.btnCloseLibraryBottom);
  bindClose(els.sheetBackdrop);

  // prevent propagation inside sheet
  els.librarySheet.addEventListener("pointerdown", (e) => e.stopPropagation());
  els.librarySheet.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });

  // tabs
  els.tabBooks.addEventListener("click", () => setTab("books"));
  els.tabChapters.addEventListener("click", () => setTab("chapters"));

  // share
  els.btnCopyShareTop.addEventListener("click", copyCurrentShare);

  // main controls
  els.btnMainHero.addEventListener("click", onMainPressed);
  els.bbMain.addEventListener("click", onMainPressed);
  els.bbStop.addEventListener("click", () => stop(true));
  els.btnRestart.addEventListener("click", restartFromHead);
  els.btnPlayCursor.addEventListener("click", playFromCursor);

  // settings shortcut
  els.bbSettings.addEventListener("click", () => {
    els.settingsPanel.open = true;
    els.settingsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus("已打開設定");
  });

  // clear
  els.btnClear.addEventListener("click", () => {
    stop(false);
    if (!confirm("確定清空文字？")) return;
    els.text.value = "";
    segs = [];
    currentIndex = 0;
    saveProgress();
    prepareSegments();
    setStatus("已清空");
  });

  // sliders
  els.rate.addEventListener("input", () => els.rateVal.textContent = Number(els.rate.value).toFixed(1));
  els.vol.addEventListener("input", () => els.volVal.textContent = Number(els.vol.value).toFixed(2));
  els.pitch.addEventListener("input", () => els.pitchVal.textContent = Number(els.pitch.value).toFixed(1));
  els.langHint.addEventListener("change", () => populateVoices());

  // font seg
  els.fontSeg.addEventListener("click", (e) => {
    const btn = e.target.closest(".segBtn");
    if (!btn) return;
    applyFont(btn.getAttribute("data-font"));
    setStatus("字體已切換");
  });

  // sleep seg
  els.sleepSeg.addEventListener("click", (e) => {
    const btn = e.target.closest(".segBtn");
    if (!btn) return;
    setSleepTimer(btn.getAttribute("data-sleep"));
  });

  // text input
  els.text.addEventListener("input", () => {
    segs = [];
    currentIndex = 0;
    prepareSegments();
    saveProgress();
  });

  // stop when hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(false);
  });
  window.addEventListener("beforeunload", () => saveProgress());
}

/* ---------------- Init ---------------- */
async function init() {
  bind();

  // restore font
  applyFont(localStorage.getItem(LS.font) || "m");

  // init sleep
  highlightSeg(els.sleepSeg, "data-sleep", "0");
  clearSleepUI();

  // init slider labels
  els.rateVal.textContent = Number(els.rate.value).toFixed(1);
  els.volVal.textContent = Number(els.vol.value).toFixed(2);
  els.pitchVal.textContent = Number(els.pitch.value).toFixed(1);

  if (!("speechSynthesis" in window)) {
    setStatus("此瀏覽器不支援語音朗讀，建議用 Chrome/Edge。");
  } else {
    populateVoices();
    window.speechSynthesis.onvoiceschanged = () => populateVoices();
  }

  await loadLibrary();

  // URL 指定章節優先，否則恢復上次進度
  const handled = await preloadFromQuery();
  if (!handled) await restoreLastIfAny();

  prepareSegments();
  updateMainButtons();
}

init().catch(() => setStatus("初始化失敗：請檢查檔案路徑與 JSON 格式"));
