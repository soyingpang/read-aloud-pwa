/* app.js (對應 index.html / styles.css v=2026-02-13-7) */
const BUILD_ID = "2026-02-13-7";
const $ = (id) => document.getElementById(id);

const bust = (path) => {
  const u = new URL(path, location.href);
  u.searchParams.set("v", BUILD_ID);
  return u.toString();
};

const LS = {
  theme: "reader:theme",
  font: "reader:font",
  last: "reader:lastProgress",
  tts: "reader:ttsSettings",
};

const els = {
  // top
  nowTitle: $("nowTitle"),
  btnOpenLibrary: $("btnOpenLibrary"),
  btnShare: $("btnShare"),
  btnOpenSettings: $("btnOpenSettings"),

  // pane
  pane: $("libraryPane"),
  btnCloseLibrary: $("btnCloseLibrary"),
  btnCloseLibraryBottom: $("btnCloseLibraryBottom"),
  search: $("search"),
  tabBooks: $("tabBooks"),
  tabChapters: $("tabChapters"),
  bookList: $("bookList"),
  chapterList: $("chapterList"),
  buildId: $("buildId"),

  // main
  heroBook: $("heroBook"),
  heroChapter: $("heroChapter"),
  btnMain: $("btnMain"),
  btnRestart: $("btnRestart"),
  btnStop: $("btnStop"),
  btnOpenLibrary2: $("btnOpenLibrary2"),
  metrics: $("metrics"),
  progress: $("progress"),
  sleepPill: $("sleepPill"),

  // text
  text: $("text"),
  btnPlayCursor: $("btnPlayCursor"),
  btnClear: $("btnClear"),
  where: $("where"),

  // overlay
  overlay: $("overlay"),

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

  // toast
  toast: $("toast"),
};

/* ---------------- State ---------------- */
let library = null;
let currentBookMeta = null;
let currentBookData = null;
let currentChapter = null;

let segs = [];
let currentIndex = 0;
let isPlaying = false;
let isPaused = false;
let utter = null;

let paneView = "books"; // books | chapters
let searchQuery = "";

// sleep timer
let sleepEndAt = 0;
let sleepTick = null;

/* ---------------- UI helpers ---------------- */
function toast(msg) {
  if (!els.toast) return;
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

/* ---------------- Overlay / Pane / Modal ---------------- */
function overlayShow() {
  els.overlay.classList.remove("hidden");
  els.overlay.setAttribute("aria-hidden", "false");
}
function overlayHide() {
  els.overlay.classList.add("hidden");
  els.overlay.setAttribute("aria-hidden", "true");
}

function paneOpen() {
  if (!isMobile()) return; // 桌機側欄常駐
  els.pane.classList.add("open");
  els.pane.setAttribute("aria-hidden", "false");
  overlayShow();
  lockBody(true);
}

function paneClose() {
  if (!isMobile()) return;
  els.pane.classList.remove("open");
  els.pane.setAttribute("aria-hidden", "true");
  overlayHide();
  lockBody(false);
}

function paneToggle() {
  if (!isMobile()) {
    toast("書庫在左側");
    return;
  }
  if (els.pane.classList.contains("open")) paneClose();
  else paneOpen();
}

function settingsOpen() {
  els.settingsModal.classList.remove("hidden");
  els.settingsModal.setAttribute("aria-hidden", "false");
  overlayShow();
  lockBody(true);
}

function settingsClose() {
  els.settingsModal.classList.add("hidden");
  els.settingsModal.setAttribute("aria-hidden", "true");
  overlayHide();
  lockBody(false);
}

/* ---------------- Theme / Font ---------------- */
function applyTheme(value) {
  const t = value === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  els.theme.value = t;
  localStorage.setItem(LS.theme, t);
}

function applyFont(value) {
  const f = (value === "s" || value === "l") ? value : "m";
  document.documentElement.dataset.font = f;
  els.fontSize.value = f;
  localStorage.setItem(LS.font, f);
}

/* ---------------- TTS voices ---------------- */
function getVoices() {
  return window.speechSynthesis?.getVoices?.() || [];
}

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

  const sorted = [...voices].sort(
    (a, b) => scoreVoice(b, els.langHint.value) - scoreVoice(a, els.langHint.value)
  );

  for (const v of sorted) {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    els.voice.appendChild(opt);
  }

  // 如果之前儲存過 voiceURI，嘗試還原
  const saved = readTTSSettings();
  if (saved?.voiceURI) {
    const found = sorted.find(x => x.voiceURI === saved.voiceURI);
    if (found) els.voice.value = saved.voiceURI;
  }
}

/* ---------------- Sleep timer ---------------- */
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
    els.sleepPill.textContent = "⏲ --:--";
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
      els.sleep.value = "0";
      setSleepTimer(0);
      toast("睡眠計時到：已停止");
      return;
    }
    els.sleepPill.textContent = `⏲ ${fmtMMSS(remain)}`;
  };

  tick();
  sleepTick = setInterval(tick, 1000);
  toast(`已設定睡眠計時：${m} 分鐘`);
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
      else for (let i = 0; i < pp.length; i += maxLen) out.push({ text: pp.slice(i, i + maxLen), start: s, end: e });
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

function updateStatusUI() {
  const t = els.text.value || "";
  if (!segs.length) segs = splitTextWithOffsets(t);

  els.metrics.textContent = `字數：${t.length}｜內部分段：${segs.length || 0}`;
  els.progress.textContent = `${Math.min(currentIndex + (isPlaying ? 1 : 0), segs.length)} / ${segs.length}`;

  if (!segs.length) {
    els.where.textContent = "—";
  } else {
    const s = segs[Math.min(currentIndex, segs.length - 1)];
    els.where.textContent = `位置：${s.start}–${s.end}`;
  }

  // 主按鈕狀態
  els.btnStop.disabled = !(isPlaying || isPaused);
  els.btnRestart.disabled = !currentChapter || !segs.length;

  if (!segs.length) {
    els.btnMain.textContent = "播放";
  } else if (!isPlaying && !isPaused) {
    els.btnMain.textContent = (currentIndex > 0 && currentIndex < segs.length) ? "續播" : "播放";
  } else if (isPlaying && !isPaused) {
    els.btnMain.textContent = "暫停";
  } else if (isPlaying && isPaused) {
    els.btnMain.textContent = "繼續";
  }
}

function resetSegmentsToText() {
  segs = splitTextWithOffsets(els.text.value || "");
  currentIndex = Math.max(0, Math.min(currentIndex, Math.max(0, segs.length - 1)));
  updateStatusUI();
}

/* ---------------- Progress ---------------- */
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

/* ---------------- TTS settings persistence ---------------- */
function saveTTSSettings() {
  const payload = {
    voiceURI: els.voice.value || "",
    rate: Number(els.rate.value || 1),
    vol: Number(els.vol.value || 1),
    pitch: Number(els.pitch.value || 1),
    langHint: els.langHint.value || "",
    sleep: String(els.sleep.value || "0"),
  };
  try { localStorage.setItem(LS.tts, JSON.stringify(payload)); } catch {}
}

function readTTSSettings() {
  try {
    const raw = localStorage.getItem(LS.tts);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function applyTTSSettingsFromStorage() {
  const s = readTTSSettings();
  if (!s) return;

  if (typeof s.rate === "number") els.rate.value = String(s.rate);
  if (typeof s.vol === "number") els.vol.value = String(s.vol);
  if (typeof s.pitch === "number") els.pitch.value = String(s.pitch);
  if (typeof s.langHint === "string") els.langHint.value = s.langHint;
  if (typeof s.sleep === "string") els.sleep.value = s.sleep;

  els.rateVal.textContent = Number(els.rate.value).toFixed(1);
  els.volVal.textContent = Number(els.vol.value).toFixed(2);
  els.pitchVal.textContent = Number(els.pitch.value).toFixed(1);

  setSleepTimer(els.sleep.value);
}

/* ---------------- Speech synthesis ---------------- */
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
    toast("此瀏覽器不支援朗讀，建議用 Chrome/Edge。");
    return;
  }
  if (!segs.length) resetSegmentsToText();
  if (!segs.length) { toast("沒有可朗讀內容"); return; }

  currentIndex = Math.max(0, Math.min(index, segs.length - 1));
  window.speechSynthesis.cancel();

  isPlaying = true;
  isPaused = false;
  updateStatusUI();

  const run = () => {
    if (currentIndex >= segs.length) {
      isPlaying = false;
      isPaused = false;
      currentIndex = 0;
      saveProgress();
      updateStatusUI();
      toast("已朗讀完畢");
      return;
    }

    saveProgress();
    updateStatusUI();

    utter = makeUtterance(segs[currentIndex].text);
    utter.onend = () => {
      if (!isPlaying) return;
      currentIndex += 1;
      run();
    };
    utter.onerror = () => {
      currentIndex += 1;
      run();
    };

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
  updateStatusUI();
  toast("已暫停");
}

function resume() {
  if (!isPlaying || !isPaused) return;
  window.speechSynthesis.resume();
  isPaused = false;
  saveProgress();
  updateStatusUI();
  toast("繼續朗讀");
}

function stop(showMsg = true) {
  try { window.speechSynthesis.cancel(); } catch {}
  isPlaying = false;
  isPaused = false;
  utter = null;
  saveProgress();
  updateStatusUI();
  if (showMsg) toast("已停止");
}

function restartFromHead() {
  if (!segs.length) resetSegmentsToText();
  currentIndex = 0;
  saveProgress();
  updateStatusUI();
  toast("已回到開頭");
}

function playFromCursor() {
  const cursor = els.text.selectionStart ?? 0;
  if (!segs.length) resetSegmentsToText();
  if (!segs.length) return;

  let idx = 0;
  for (let i = 0; i < segs.length; i++) {
    if (cursor >= segs[i].start && cursor <= segs[i].end) { idx = i; break; }
    if (cursor > segs[i].end) idx = i;
  }
  speakFrom(idx);
}

function onMainPressed() {
  if (!segs.length) resetSegmentsToText();
  if (!segs.length) { toast("請先載入章節或貼上文字"); return; }

  if (!isPlaying && !isPaused) {
    const start = (currentIndex >= segs.length) ? 0 : currentIndex;
    speakFrom(start);
    return;
  }
  if (isPlaying && !isPaused) { pause(); return; }
  if (isPlaying && isPaused) { resume(); return; }
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

/* ---------------- Library rendering ---------------- */
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

function matchesQuery(str) {
  if (!searchQuery) return true;
  return String(str || "").toLowerCase().includes(searchQuery);
}

function renderBooks(books) {
  els.bookList.innerHTML = "";
  const arr = books || [];
  let count = 0;

  for (const b of arr) {
    const hay = `${b.title || ""} ${b.id || ""}`;
    if (!matchesQuery(hay)) continue;
    count += 1;

    const item = document.createElement("div");
    item.className = "item";

    const main = document.createElement("div");
    main.className = "itemMain";
    main.innerHTML = `
      <div class="itemTitle">${escapeHtml(b.title || b.id)}</div>
      <div class="itemSub">點選以載入章節</div>
    `;
    main.addEventListener("click", async () => {
      await openBook(b);
      setPaneView("chapters");
      if (isMobile()) paneOpen(); // 保持流程一致（如果已開也不影響）
    });

    item.appendChild(main);
    els.bookList.appendChild(item);
  }

  if (!count) els.bookList.textContent = "找不到符合的書籍";
}

function renderChapters(chapters) {
  els.chapterList.innerHTML = "";
  const arr = [...(chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let count = 0;

  for (const ch of arr) {
    const hay = `${ch.title || ""} ${ch.id || ""}`;
    if (!matchesQuery(hay)) continue;
    count += 1;

    const item = document.createElement("div");
    item.className = "item";

    const main = document.createElement("div");
    main.className = "itemMain";
    main.innerHTML = `
      <div class="itemTitle">${escapeHtml(ch.title || ch.id)}</div>
      <div class="itemSub">點選載入並可立即播放</div>
    `;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "itemBtn";
    btn.textContent = "連結";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await copyShareFor(currentBookData?.id, ch.id);
    });

    main.addEventListener("click", async () => {
      await openChapter(ch, { autoplay: false, startIndex: 0, restored: false });
      if (isMobile()) paneClose();
      toast("章節已載入");
    });

    item.appendChild(main);
    item.appendChild(btn);
    els.chapterList.appendChild(item);
  }

  if (!count) els.chapterList.textContent = "找不到符合的章節";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------- Open book / chapter ---------------- */
async function loadLibrary() {
  library = await fetchJson("texts/library.json");
  renderBooks(library.books || []);
}

async function openBook(bookMeta) {
  stop(false);
  currentBookMeta = bookMeta;
  currentBookData = await fetchJson(bookMeta.manifest);

  els.tabChapters.disabled = false;
  els.tabChapters.setAttribute("aria-disabled", "false");

  renderChapters(currentBookData.chapters || []);

  els.nowTitle.textContent = currentBookData.title || bookMeta.title || "已選書";
  els.heroBook.textContent = currentBookData.title || bookMeta.title || "已選書";
  els.heroChapter.textContent = "請選擇章節";

  currentChapter = null;
  currentIndex = 0;
  segs = [];
  updateStatusUI();
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
  resetSegmentsToText();

  saveProgress();

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

/* ---------------- Share ---------------- */
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
    if (isMobile()) paneOpen();
    return;
  }
  await copyShareFor(currentBookData.id, currentChapter.id);
}

/* ---------------- URL preload / restore ---------------- */
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
  setPaneView("chapters");

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
  setPaneView("chapters");

  const ch = (currentBookData?.chapters || []).find(c => c.id === last.chId);
  if (!ch) return;

  await openChapter(ch, { autoplay: false, startIndex: Number(last.index || 0), restored: true });
}

/* ---------------- Bind ---------------- */
function bind() {
  if (els.buildId) els.buildId.textContent = BUILD_ID;

  // 打開書庫
  els.btnOpenLibrary.addEventListener("click", paneToggle);
  els.btnOpenLibrary2.addEventListener("click", () => (isMobile() ? paneOpen() : toast("書庫在左側")));

  // 關閉書庫（手機）
  const closePaneHandler = (e) => { e.preventDefault(); e.stopPropagation(); paneClose(); };
  els.btnCloseLibrary.addEventListener("pointerdown", closePaneHandler, { passive: false, capture: true });
  els.btnCloseLibraryBottom.addEventListener("pointerdown", closePaneHandler, { passive: false, capture: true });
  els.btnCloseLibrary.addEventListener("click", closePaneHandler, true);
  els.btnCloseLibraryBottom.addEventListener("click", closePaneHandler, true);

  // overlay 點擊：先關設定，再關書庫
  els.overlay.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!els.settingsModal.classList.contains("hidden")) settingsClose();
    if (els.pane.classList.contains("open")) paneClose();
  }, { passive: false });

  // ESC
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!els.settingsModal.classList.contains("hidden")) settingsClose();
    if (els.pane.classList.contains("open")) paneClose();
  });

  // Tabs
  els.tabBooks.addEventListener("click", () => setPaneView("books"));
  els.tabChapters.addEventListener("click", () => {
    if (els.tabChapters.disabled) return;
    setPaneView("chapters");
  });

  // Search
  els.search.addEventListener("input", () => {
    searchQuery = (els.search.value || "").trim().toLowerCase();
    renderBooks(library?.books || []);
    renderChapters(currentBookData?.chapters || []);
  });

  // Share
  els.btnShare.addEventListener("click", copyCurrentShare);

  // Settings open/close
  els.btnOpenSettings.addEventListener("click", settingsOpen);
  els.btnCloseSettings.addEventListener("click", settingsClose);
  els.btnDoneSettings.addEventListener("click", settingsClose);

  // Theme / font
  els.theme.addEventListener("change", () => applyTheme(els.theme.value));
  els.fontSize.addEventListener("change", () => applyFont(els.fontSize.value));

  // Sleep
  els.sleep.addEventListener("change", () => { setSleepTimer(els.sleep.value); saveTTSSettings(); });

  // Sliders
  els.rate.addEventListener("input", () => { els.rateVal.textContent = Number(els.rate.value).toFixed(1); saveTTSSettings(); });
  els.vol.addEventListener("input", () => { els.volVal.textContent = Number(els.vol.value).toFixed(2); saveTTSSettings(); });
  els.pitch.addEventListener("input", () => { els.pitchVal.textContent = Number(els.pitch.value).toFixed(1); saveTTSSettings(); });

  // Voice/language
  els.langHint.addEventListener("change", () => { populateVoices(); saveTTSSettings(); });
  els.voice.addEventListener("change", () => saveTTSSettings());

  // Player
  els.btnMain.addEventListener("click", onMainPressed);
  els.btnStop.addEventListener("click", () => stop(true));
  els.btnRestart.addEventListener("click", restartFromHead);

  // Text
  els.btnPlayCursor.addEventListener("click", playFromCursor);
  els.btnClear.addEventListener("click", () => {
    stop(false);
    if (!confirm("確定清空文字？")) return;
    els.text.value = "";
    segs = [];
    currentIndex = 0;
    saveProgress();
    updateStatusUI();
    toast("已清空");
  });

  els.text.addEventListener("input", () => {
    segs = [];
    currentIndex = 0;
    updateStatusUI();
    saveProgress();
  });

  // Visibility
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(false);
  });

  // Responsive changes
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      // 桌機：確保 overlay 不阻擋
      overlayHide();
      lockBody(false);
      els.pane.classList.remove("open");
      els.pane.setAttribute("aria-hidden", "false");
    } else {
      els.pane.setAttribute("aria-hidden", els.pane.classList.contains("open") ? "false" : "true");
    }
  });
}

/* ---------------- init ---------------- */
async function init() {
  bind();

  // restore theme/font
  applyTheme(localStorage.getItem(LS.theme) || "dark");
  applyFont(localStorage.getItem(LS.font) || "m");

  // init slider labels
  els.rateVal.textContent = Number(els.rate.value).toFixed(1);
  els.volVal.textContent = Number(els.vol.value).toFixed(2);
  els.pitchVal.textContent = Number(els.pitch.value).toFixed(1);

  // restore TTS settings (sleep included)
  applyTTSSettingsFromStorage();

  // voices
  if (!("speechSynthesis" in window)) {
    toast("此瀏覽器不支援朗讀，建議用 Chrome/Edge。");
  } else {
    populateVoices();
    window.speechSynthesis.onvoiceschanged = () => populateVoices();
  }

  await loadLibrary();
  setPaneView("books");

  const handled = await preloadFromQuery();
  if (!handled) await restoreLastIfAny();

  // initial status
  updateStatusUI();
  toast(`已載入 v${BUILD_ID}`);
}

init().catch((e) => {
  console.error(e);
  toast("初始化失敗：請檢查 texts/library.json 與各章節檔案路徑");
});
