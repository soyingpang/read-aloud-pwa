const $ = (id) => document.getElementById(id);

const els = {
  bookList: $("bookList"),
  chapterList: $("chapterList"),
  nowTitle: $("nowTitle"),

  text: $("text"),
  btnParse: $("btnParse"),
  btnPlay: $("btnPlay"),
  btnPlayCursor: $("btnPlayCursor"),
  btnPause: $("btnPause"),
  btnResume: $("btnResume"),
  btnStop: $("btnStop"),
  btnClear: $("btnClear"),
  btnCopyShare: $("btnCopyShare"),

  status: $("status"),
  metrics: $("metrics"),
  segments: $("segments"),
  chkAutoScroll: $("chkAutoScroll"),

  voice: $("voice"),
  rate: $("rate"),
  rateVal: $("rateVal"),
  vol: $("vol"),
  volVal: $("volVal"),
  pitch: $("pitch"),
  pitchVal: $("pitchVal"),
  langHint: $("langHint"),

  progress: $("progress"),
  where: $("where"),
};

let library = null;
let currentBook = null;     // {id,title,manifest}
let currentBookData = null; // book.json content
let currentChapter = null;  // {id,title,file}
let segs = [];
let currentIndex = 0;

let isPlaying = false;
let isPaused = false;
let utter = null;

function setStatus(msg) { els.status.textContent = msg; }

function setButtons() {
  els.btnPause.disabled = !isPlaying || isPaused;
  els.btnResume.disabled = !isPlaying || !isPaused;
  els.btnStop.disabled = !isPlaying && !isPaused;
  els.btnPlay.disabled = isPlaying && !isPaused;
  els.btnPlayCursor.disabled = isPlaying && !isPaused;
}

function updateMetrics() {
  const t = els.text.value || "";
  els.metrics.textContent = `字數：${t.length}｜段落：${segs.length || 0}`;
}

function updateProgress() {
  els.progress.textContent = `${Math.min(currentIndex + (isPlaying ? 1 : 0), segs.length)} / ${segs.length}`;
  if (!segs.length) { els.where.textContent = "—"; return; }
  const s = segs[Math.min(currentIndex, segs.length - 1)];
  els.where.textContent = s ? `字元範圍：${s.start}–${s.end}` : "—";
}

function scrollActiveIntoView() {
  if (!els.chkAutoScroll.checked) return;
  const active = els.segments.querySelector(".seg.active");
  if (!active) return;
  active.scrollIntoView({ behavior: "smooth", block: "center" });
}

function highlightActive() {
  const nodes = els.segments.querySelectorAll(".seg");
  nodes.forEach(n => n.classList.remove("active"));
  const active = els.segments.querySelector(`.seg[data-idx="${currentIndex}"]`);
  if (active) active.classList.add("active");
  scrollActiveIntoView();
}

/* ---------------- Voice handling ---------------- */
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
}

/* ---------------- Segmentation (long text) ---------------- */
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

function renderSegments() {
  if (!segs.length) {
    els.segments.textContent = "尚未解析";
    updateProgress();
    return;
  }
  els.segments.innerHTML = "";
  segs.forEach((s, idx) => {
    const span = document.createElement("span");
    span.className = "seg" + (idx === currentIndex ? " active" : "");
    span.dataset.idx = String(idx);
    span.textContent = s.text + (idx === segs.length - 1 ? "" : " ");
    span.addEventListener("click", () => {
      stop(false);
      currentIndex = idx;
      highlightActive();
      updateProgress();
      setStatus(`已跳到第 ${idx + 1} 段`);
    });
    els.segments.appendChild(span);
  });
  scrollActiveIntoView();
}

function parse() {
  const t = els.text.value || "";
  segs = splitTextWithOffsets(t);

  if (!segs.length) {
    currentIndex = 0;
    setStatus("沒有可朗讀內容");
  } else {
    currentIndex = Math.min(currentIndex, segs.length - 1);
    setStatus(`解析完成：共 ${segs.length} 段`);
  }

  updateMetrics();
  renderSegments();
  updateProgress();
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
  if (!segs.length) parse();
  if (!segs.length) return;

  currentIndex = Math.max(0, Math.min(index, segs.length - 1));
  highlightActive();
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
      updateProgress();
      return;
    }

    highlightActive();
    updateProgress();
    setStatus(`朗讀中：第 ${currentIndex + 1} / ${segs.length} 段`);

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

  run();
}

function pause() {
  if (!isPlaying) return;
  window.speechSynthesis.pause();
  isPaused = true;
  setButtons();
  setStatus("已暫停");
}

function resume() {
  if (!isPlaying) return;
  window.speechSynthesis.resume();
  isPaused = false;
  setButtons();
  setStatus(`繼續朗讀：第 ${currentIndex + 1} 段`);
}

function stop(updateStatus = true) {
  window.speechSynthesis.cancel();
  isPlaying = false;
  isPaused = false;
  utter = null;
  setButtons();
  highlightActive();
  updateProgress();
  if (updateStatus) setStatus("已停止");
}

function playFromCursor() {
  const cursor = els.text.selectionStart ?? 0;
  if (!segs.length) parse();
  if (!segs.length) return;

  let idx = 0;
  for (let i = 0; i < segs.length; i++) {
    if (cursor >= segs[i].start && cursor <= segs[i].end) { idx = i; break; }
    if (cursor > segs[i].end) idx = i;
  }
  speakFrom(idx);
}

/* ---------------- Data loading ---------------- */
async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`JSON讀取失敗：${path}`);
  return await res.json();
}

async function loadLibrary() {
  library = await fetchJson("texts/library.json");
  renderBookList(library.books || []);
}

function renderBookList(books) {
  els.bookList.innerHTML = "";
  if (!books.length) {
    els.bookList.textContent = "沒有書";
    return;
  }

  books.forEach(b => {
    const row = document.createElement("div");
    row.className = "itemRow";

    const main = document.createElement("div");
    main.className = "itemMain";
    main.textContent = b.title || b.id;
    main.addEventListener("click", () => openBook(b));

    row.appendChild(main);
    els.bookList.appendChild(row);
  });
}

async function openBook(bookMeta) {
  stop(false);
  currentBook = bookMeta;
  currentBookData = await fetchJson(bookMeta.manifest);

  renderChapterList(currentBookData.chapters || []);
  els.chapterList.classList.remove("mutedBox");
  setStatus(`已載入：${currentBookData.title || currentBook.title}`);
}

function renderChapterList(chapters) {
  els.chapterList.innerHTML = "";
  if (!chapters.length) {
    els.chapterList.textContent = "此書沒有章節";
    return;
  }

  const sorted = [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  sorted.forEach(ch => {
    const row = document.createElement("div");
    row.className = "itemRow";

    const main = document.createElement("div");
    main.className = "itemMain";
    main.textContent = ch.title || ch.id;
    main.addEventListener("click", () => openChapter(ch));

    const share = document.createElement("button");
    share.className = "btn";
    share.textContent = "播放連結";
    share.addEventListener("click", async () => {
      if (!currentBookData?.id) return;
      const url = new URL(location.href);
      url.searchParams.set("book", currentBookData.id);
      url.searchParams.set("ch", ch.id);
      url.searchParams.set("autoplay", "1");
      url.searchParams.delete("file");
      await navigator.clipboard.writeText(url.toString());
      setStatus("已複製播放連結");
    });

    row.appendChild(main);
    row.appendChild(share);
    els.chapterList.appendChild(row);
  });
}

async function loadTextFile(file, autoplay) {
  try {
    const res = await fetch(file, { cache: "no-store" });
    if (!res.ok) { setStatus(`讀取失敗：${file}`); return; }

    const text = await res.text();
    els.text.value = text;

    parse();

    if (autoplay) {
      setStatus("已載入文字：請點一下畫面開始朗讀");
      const once = () => speakFrom(0);
      window.addEventListener("pointerdown", once, { once: true });
    } else {
      setStatus("已載入文字");
    }
  } catch {
    setStatus("載入失敗：請檢查檔案路徑");
  }
}

async function openChapter(ch) {
  stop(false);
  currentChapter = ch;

  const bookTitle = currentBookData?.title || currentBook?.title || "書";
  const chTitle = ch.title || ch.id;
  els.nowTitle.textContent = `${bookTitle} / ${chTitle}`;

  await loadTextFile(ch.file, false);

  // 更新網址（可書籤/可分享）
  if (currentBookData?.id) {
    const url = new URL(location.href);
    url.searchParams.set("book", currentBookData.id);
    url.searchParams.set("ch", ch.id);
    url.searchParams.delete("autoplay");
    url.searchParams.delete("file");
    history.replaceState({}, "", url);
  }
}

async function preloadFromQuery() {
  const params = new URLSearchParams(location.search);

  // 兼容舊模式：?file=xxx.txt&autoplay=1
  const file = params.get("file");
  if (file) {
    const autoplay = params.get("autoplay") === "1";
    await loadTextFile(file, autoplay);
    return;
  }

  // 新模式：?book=...&ch=...&autoplay=1
  const bookId = params.get("book");
  const chId = params.get("ch");
  const autoplay = params.get("autoplay") === "1";

  if (!bookId || !chId) return;
  if (!library) await loadLibrary();

  const bookMeta = (library.books || []).find(b => b.id === bookId);
  if (!bookMeta) { setStatus("找不到指定書"); return; }

  await openBook(bookMeta);

  const ch = (currentBookData?.chapters || []).find(c => c.id === chId);
  if (!ch) { setStatus("找不到指定章節"); return; }

  currentChapter = ch;
  const bookTitle = currentBookData?.title || bookMeta.title || "書";
  const chTitle = ch.title || ch.id;
  els.nowTitle.textContent = `${bookTitle} / ${chTitle}`;

  await loadTextFile(ch.file, autoplay);
}

async function copyShareLink() {
  if (!currentBookData?.id || !currentChapter?.id) {
    alert("請先選一本書並選一個章節，才能複製章節播放連結。");
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set("book", currentBookData.id);
  url.searchParams.set("ch", currentChapter.id);
  url.searchParams.set("autoplay", "1");
  url.searchParams.delete("file");
  await navigator.clipboard.writeText(url.toString());
  setStatus("已複製章節播放連結");
}

/* ---------------- Bind UI ---------------- */
function bind() {
  els.btnParse.addEventListener("click", parse);
  els.btnPlay.addEventListener("click", () => speakFrom(0));
  els.btnPlayCursor.addEventListener("click", playFromCursor);
  els.btnPause.addEventListener("click", pause);
  els.btnResume.addEventListener("click", resume);
  els.btnStop.addEventListener("click", () => stop(true));

  els.btnCopyShare.addEventListener("click", copyShareLink);

  els.btnClear.addEventListener("click", () => {
    stop(false);
    if (!confirm("確定清空文字與分段？")) return;
    els.text.value = "";
    segs = [];
    currentIndex = 0;
    els.nowTitle.textContent = "文字";
    els.segments.textContent = "尚未解析";
    updateMetrics();
    updateProgress();
    setStatus("已清空");
  });

  els.rate.addEventListener("input", () => els.rateVal.textContent = Number(els.rate.value).toFixed(1));
  els.vol.addEventListener("input", () => els.volVal.textContent = Number(els.vol.value).toFixed(2));
  els.pitch.addEventListener("input", () => els.pitchVal.textContent = Number(els.pitch.value).toFixed(1));
  els.langHint.addEventListener("change", () => populateVoices());

  els.text.addEventListener("input", updateMetrics);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(false);
  });
}

async function init() {
  bind();

  els.rateVal.textContent = Number(els.rate.value).toFixed(1);
  els.volVal.textContent = Number(els.vol.value).toFixed(2);
  els.pitchVal.textContent = Number(els.pitch.value).toFixed(1);

  if (!("speechSynthesis" in window)) {
    setStatus("此瀏覽器不支援 SpeechSynthesis，建議用 Chrome/Edge。");
  } else {
    populateVoices();
    window.speechSynthesis.onvoiceschanged = () => populateVoices();
  }

  updateMetrics();
  updateProgress();
  setButtons();

  await loadLibrary();
  await preloadFromQuery();
}

init().catch(() => setStatus("初始化失敗：請檢查檔案路徑與JSON格式"));
