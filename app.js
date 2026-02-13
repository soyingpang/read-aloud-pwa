const $ = (id) => document.getElementById(id);

const els = {
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

let currentFile = ""; // 目前載入的 TXT 檔案路徑（用於複製分享連結）
let segs = [];        // 分段結果：{text,start,end}
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
  const maxLen = 220; // 安全分段長度
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

    // 先用較柔性的分隔符（逗號/空白）切，再不行就硬切
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
      // 跳過錯誤段落避免卡死
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

/* ---------------- Load TXT & query preload ---------------- */
async function loadTextFile(file, autoplay) {
  try {
    const res = await fetch(file, { cache: "no-store" });
    if (!res.ok) { setStatus(`讀取失敗：${file}`); return; }

    const text = await res.text();
    els.text.value = text;
    currentFile = file;

    parse();

    if (autoplay) {
      // 避免瀏覽器阻擋「無手勢自動出聲」：改成提示 + 第一次點擊開始
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

async function preloadFromQuery() {
  const params = new URLSearchParams(location.search);
  const file = params.get("file");
  const autoplay = params.get("autoplay") === "1";
  if (!file) return;
  await loadTextFile(file, autoplay);
}

async function copyShareLink() {
  if (!currentFile) {
    alert("目前不是從檔案載入，無法產生播放連結。請先從「我的書」點選載入TXT。");
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set("file", currentFile);
  url.searchParams.set("autoplay", "1");
  await navigator.clipboard.writeText(url.toString());
  setStatus("已複製播放連結");
}

/* ---------------- Book list from texts/library.json ---------------- */
async function loadBookList() {
  const container = document.getElementById("bookList");
  if (!container) return;

  try {
    const res = await fetch("texts/library.json", { cache: "no-store" });
    if (!res.ok) throw new Error("no manifest");
    const lib = await res.json();
    const books = lib.books || [];

    container.innerHTML = "";

    books.forEach(b => {
      const row = document.createElement("div");
      row.className = "bookItem";

      const title = document.createElement("div");
      title.className = "bookTitle";
      title.textContent = b.title || b.id || b.file;

      title.addEventListener("click", async () => {
        stop(false);
        await loadTextFile(b.file, false);

        // 更新網址（方便書籤/也方便你手動複製）
        const url = new URL(location.href);
        url.searchParams.set("file", b.file);
        url.searchParams.delete("autoplay");
        history.replaceState({}, "", url);
      });

      const linkBtn = document.createElement("button");
      linkBtn.className = "btn";
      linkBtn.textContent = "播放連結";
      linkBtn.addEventListener("click", async () => {
        const url = new URL(location.href);
        url.searchParams.set("file", b.file);
        url.searchParams.set("autoplay", "1");
        await navigator.clipboard.writeText(url.toString());
        setStatus("已複製播放連結");
      });

      row.appendChild(title);
      row.appendChild(linkBtn);
      container.appendChild(row);
    });

    if (!books.length) container.textContent = "尚未新增書單。";
  } catch {
    container.textContent = "找不到 texts/library.json，請先建立書單檔。";
  }
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
    currentFile = "";
    segs = [];
    currentIndex = 0;
    els.segments.textContent = "尚未解析";
    updateMetrics();
    updateProgress();
    setStatus("已清空");
  });

  els.rate.addEventListener("input", () => els.rateVal.textContent = Number(els.rate.value).toFixed(1));
  els.vol.addEventListener("input", () => els.volVal.textContent = Number(els.vol.value).toFixed(2));
  els.pitch.addEventListener("input", () => els.pitchVal.textContent = Number(els.pitch.value).toFixed(1));
  els.langHint.addEventListener("change", () => populateVoices());

  els.text.addEventListener("input", () => updateMetrics());

  // 切到背景就停止，避免在背景播放造成使用者困擾
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(false);
  });
}

function init() {
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

  loadBookList();
  preloadFromQuery();
}

init();
