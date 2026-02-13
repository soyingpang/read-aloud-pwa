/* 讀書朗讀 PWA - 純前端版
   - 分句、逐句朗讀
   - 高亮、可點句跳轉
   - 語速、聲線（優先普通話）
   - 進度/書籤 localStorage
   - 基本 PWA 安裝提示與離線快取
*/

const $ = (id) => document.getElementById(id);

const els = {
  inputText: $("inputText"),
  btnParse: $("btnParse"),
  btnLoadSample: $("btnLoadSample"),
  btnPlay: $("btnPlay"),
  btnPause: $("btnPause"),
  btnStop: $("btnStop"),
  btnPrev: $("btnPrev"),
  btnNext: $("btnNext"),
  voiceSelect: $("voiceSelect"),
  rate: $("rate"),
  rateVal: $("rateVal"),
  reader: $("reader"),
  status: $("status"),
  barFill: $("barFill"),
  progressText: $("progressText"),
  btnBookmark: $("btnBookmark"),
  bookmarkSelect: $("bookmarkSelect"),
  btnRemoveBookmark: $("btnRemoveBookmark"),
  chkAutoScroll: $("chkAutoScroll"),
  btnClear: $("btnClear"),
  btnInstall: $("btnInstall"),
};

const STORAGE_KEY = "read_aloud_pwa_v1";

let state = {
  sentences: [],
  activeIndex: 0,
  isPlaying: false,
  voices: [],
  selectedVoiceURI: "",
  rate: 1.0,
  bookmarks: [], // { index, label, ts }
  autoScroll: true,
  textRaw: "",
};

let currentUtterance = null;
let deferredPrompt = null;

/* ---------- Utils ---------- */
function setStatus(msg, tone = "info") {
  els.status.textContent = msg;
  // 可視化 tone（簡單示意）
  if (tone === "ok") els.status.style.borderColor = "rgba(34,197,94,.35)";
  else if (tone === "warn") els.status.style.borderColor = "rgba(245,158,11,.35)";
  else if (tone === "danger") els.status.style.borderColor = "rgba(239,68,68,.35)";
  else els.status.style.borderColor = "rgba(148,163,184,.16)";
}

function save() {
  const payload = {
    sentences: state.sentences,
    activeIndex: state.activeIndex,
    selectedVoiceURI: state.selectedVoiceURI,
    rate: state.rate,
    bookmarks: state.bookmarks,
    autoScroll: state.autoScroll,
    textRaw: state.textRaw,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    state.sentences = Array.isArray(payload.sentences) ? payload.sentences : [];
    state.activeIndex = Number.isFinite(payload.activeIndex) ? payload.activeIndex : 0;
    state.selectedVoiceURI = payload.selectedVoiceURI || "";
    state.rate = typeof payload.rate === "number" ? payload.rate : 1.0;
    state.bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
    state.autoScroll = payload.autoScroll !== false;
    state.textRaw = payload.textRaw || "";
  } catch (e) {
    console.warn("load error", e);
  }
}

function clampIndex(i) {
  if (!state.sentences.length) return 0;
  return Math.max(0, Math.min(state.sentences.length - 1, i));
}

/* ---------- Sentence Parsing ---------- */
function splitIntoSentences(text) {
  const t = (text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return [];

  // 以中英文標點 + 換行進行分句；保留標點
  const parts = t
    .replace(/\n+/g, "\n")
    .split(/(?<=[。！？!?；;…])\s+|(?<=[。！？!?；;…])\n+|\n+/);

  const sentences = [];
  for (const p of parts) {
    const s = (p || "").trim();
    if (!s) continue;

    // 若句子過長，再以逗號/頓號做次分割，避免一次朗讀太長
    if (s.length > 160) {
      const sub = s.split(/(?<=[，,、])\s*/);
      sub.forEach(x => {
        const y = (x || "").trim();
        if (y) sentences.push(y);
      });
    } else {
      sentences.push(s);
    }
  }
  return sentences;
}

/* ---------- Render ---------- */
function renderReader() {
  const { sentences } = state;
  if (!sentences.length) {
    els.reader.classList.add("empty");
    els.reader.textContent = "尚未解析內容";
    updateProgress();
    return;
  }

  els.reader.classList.remove("empty");
  els.reader.innerHTML = "";

  sentences.forEach((s, idx) => {
    const span = document.createElement("span");
    span.className = "sentence" + (idx === state.activeIndex ? " active" : "");
    span.textContent = s + (idx === sentences.length - 1 ? "" : " ");
    span.dataset.idx = String(idx);
    span.addEventListener("click", () => {
      stopSpeak(false);
      state.activeIndex = idx;
      renderReader();
      updateProgress();
      save();
      setStatus(`跳轉到第 ${idx + 1} 句`, "ok");
    });
    els.reader.appendChild(span);
  });

  if (state.autoScroll) scrollActiveIntoView();
}

function scrollActiveIntoView() {
  const active = els.reader.querySelector(".sentence.active");
  if (!active) return;
  active.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateProgress() {
  const total = state.sentences.length;
  const current = total ? state.activeIndex + 1 : 0;
  els.progressText.textContent = `${current} / ${total}`;
  const pct = total ? (current / total) * 100 : 0;
  els.barFill.style.width = `${pct}%`;
}

/* ---------- Speech ---------- */
function getPreferredMandarinVoices(voices) {
  // 盡量挑 zh-CN / cmn / Mandarin / 普通话 的聲線
  const score = (v) => {
    const lang = (v.lang || "").toLowerCase();
    const name = (v.name || "").toLowerCase();
    const uri = (v.voiceURI || "").toLowerCase();

    let s = 0;
    if (lang.startsWith("zh-cn")) s += 50;
    if (lang.includes("cmn")) s += 45;
    if (lang.startsWith("zh")) s += 20;
    if (name.includes("mandarin") || name.includes("putonghua") || name.includes("普通")) s += 30;
    if (name.includes("taiwan") || name.includes("zh-tw")) s += 5; // 仍可用，但普通話優先
    if (uri.includes("zh")) s += 5;
    return s;
  };

  return [...voices].sort((a, b) => score(b) - score(a));
}

function populateVoices() {
  if (!("speechSynthesis" in window)) {
    setStatus("此瀏覽器不支援朗讀（Speech Synthesis）。", "danger");
    return;
  }

  const voices = window.speechSynthesis.getVoices();
  state.voices = voices;

  const preferred = getPreferredMandarinVoices(voices);

  els.voiceSelect.innerHTML = "";
  if (!voices.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（尚未載入聲線）";
    els.voiceSelect.appendChild(opt);
    return;
  }

  preferred.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    els.voiceSelect.appendChild(opt);
  });

  // 還原選擇
  if (state.selectedVoiceURI) {
    els.voiceSelect.value = state.selectedVoiceURI;
  } else {
    // 預設選第一個偏好聲線
    els.voiceSelect.selectedIndex = 0;
    state.selectedVoiceURI = els.voiceSelect.value;
  }
  save();
}

function createUtterance(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = state.rate;

  const selectedURI = state.selectedVoiceURI || els.voiceSelect.value;
  const voice = state.voices.find(v => v.voiceURI === selectedURI);
  if (voice) u.voice = voice;

  return u;
}

function setControlsPlaying(isPlaying) {
  state.isPlaying = isPlaying;
  els.btnPlay.disabled = isPlaying || !state.sentences.length;
  els.btnPause.disabled = !isPlaying;
  els.btnStop.disabled = !state.sentences.length;
  els.btnPrev.disabled = !state.sentences.length;
  els.btnNext.disabled = !state.sentences.length;
}

function speakCurrent() {
  if (!state.sentences.length) {
    setStatus("請先解析文字。", "warn");
    return;
  }
  if (!("speechSynthesis" in window)) {
    setStatus("此瀏覽器不支援朗讀。", "danger");
    return;
  }

  // iOS/Safari 需使用者手勢觸發播放；這裡由按鈕觸發即可
  stopSpeak(false);

  const idx = clampIndex(state.activeIndex);
  state.activeIndex = idx;
  renderReader();
  updateProgress();

  const text = state.sentences[idx];
  currentUtterance = createUtterance(text);

  currentUtterance.onstart = () => {
    setControlsPlaying(true);
    setStatus(`朗讀中：第 ${idx + 1} 句`, "ok");
    if (state.autoScroll) scrollActiveIntoView();
  };

  currentUtterance.onend = () => {
    // 自動前進下一句
    if (state.isPlaying) {
      const next = idx + 1;
      if (next < state.sentences.length) {
        state.activeIndex = next;
        save();
        renderReader();
        updateProgress();
        speakCurrent();
      } else {
        setStatus("已朗讀完畢。", "ok");
        setControlsPlaying(false);
        state.isPlaying = false;
        save();
      }
    }
  };

  currentUtterance.onerror = (e) => {
    console.warn(e);
    setStatus("朗讀失敗：可能是聲線未就緒或被瀏覽器限制。", "danger");
    setControlsPlaying(false);
    state.isPlaying = false;
  };

  window.speechSynthesis.speak(currentUtterance);
  save();
}

function pauseSpeak() {
  if (!("speechSynthesis" in window)) return;
  if (!state.isPlaying) return;
  window.speechSynthesis.pause();
  setStatus("已暫停。", "warn");
  // 注意：pause 不會觸發 onend
  els.btnPlay.disabled = false;
  els.btnPause.disabled = true;
}

function resumeSpeak() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.resume();
  setStatus("繼續朗讀。", "ok");
  els.btnPlay.disabled = true;
  els.btnPause.disabled = false;
}

function stopSpeak(updateUI = true) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
  if (updateUI) {
    setControlsPlaying(false);
    setStatus("已停止。", "warn");
  }
}

/* ---------- Bookmarks ---------- */
function renderBookmarks() {
  // 清空（保留第一個 placeholder）
  els.bookmarkSelect.innerHTML = `<option value="">書籤（點選跳轉）</option>`;
  state.bookmarks.forEach((b, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = b.label;
    els.bookmarkSelect.appendChild(opt);
  });
}

function addBookmark() {
  if (!state.sentences.length) {
    setStatus("請先解析文字再加入書籤。", "warn");
    return;
  }
  const idx = state.activeIndex;
  const snippet = state.sentences[idx].slice(0, 18).replace(/\s+/g, " ");
  const label = `第 ${idx + 1} 句｜${snippet}${state.sentences[idx].length > 18 ? "…" : ""}`;
  state.bookmarks.push({ index: idx, label, ts: Date.now() });
  save();
  renderBookmarks();
  setStatus("已加入書籤。", "ok");
}

function removeSelectedBookmark() {
  const v = els.bookmarkSelect.value;
  if (v === "") return;
  const i = Number(v);
  if (!Number.isFinite(i)) return;
  state.bookmarks.splice(i, 1);
  save();
  renderBookmarks();
  els.bookmarkSelect.value = "";
  setStatus("已移除書籤。", "warn");
}

/* ---------- PWA ---------- */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
}

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

/* ---------- Events ---------- */
function bindEvents() {
  els.btnLoadSample.addEventListener("click", () => {
    els.inputText.value =
`交互设计可以被拆分为五个维度：文字、视觉、物体与空间、时间和行为。
前三个维度让交互成为可能，而后两个维度定义交互。
现在我们从时间与行为开始，设计更自然的对话。`;
    setStatus("已載入範例。", "ok");
  });

  els.btnParse.addEventListener("click", () => {
    const raw = els.inputText.value || "";
    const sentences = splitIntoSentences(raw);
    state.sentences = sentences;
    state.textRaw = raw;
    state.activeIndex = 0;
    save();
    renderReader();
    renderBookmarks();
    updateProgress();

    if (sentences.length) setStatus(`解析完成：共 ${sentences.length} 句。`, "ok");
    else setStatus("沒有可解析的內容。", "warn");

    setControlsPlaying(false);
    els.btnStop.disabled = !sentences.length;
  });

  els.btnPlay.addEventListener("click", () => {
    // 若目前是暫停狀態，按播放就 resume；否則從當前句開始 speak
    if ("speechSynthesis" in window && window.speechSynthesis.paused) {
      resumeSpeak();
      return;
    }
    state.isPlaying = true;
    speakCurrent();
  });

  els.btnPause.addEventListener("click", () => pauseSpeak());

  els.btnStop.addEventListener("click", () => {
    state.isPlaying = false;
    stopSpeak(true);
    save();
  });

  els.btnPrev.addEventListener("click", () => {
    stopSpeak(false);
    state.activeIndex = clampIndex(state.activeIndex - 1);
    renderReader();
    updateProgress();
    save();
    setStatus(`第 ${state.activeIndex + 1} 句`, "ok");
  });

  els.btnNext.addEventListener("click", () => {
    stopSpeak(false);
    state.activeIndex = clampIndex(state.activeIndex + 1);
    renderReader();
    updateProgress();
    save();
    setStatus(`第 ${state.activeIndex + 1} 句`, "ok");
  });

  els.voiceSelect.addEventListener("change", () => {
    state.selectedVoiceURI = els.voiceSelect.value;
    save();
    setStatus("已切換聲線。", "ok");
  });

  els.rate.addEventListener("input", () => {
    state.rate = Number(els.rate.value);
    els.rateVal.textContent = state.rate.toFixed(1);
    save();
  });

  els.btnBookmark.addEventListener("click", addBookmark);

  els.bookmarkSelect.addEventListener("change", () => {
    const v = els.bookmarkSelect.value;
    if (v === "") return;
    const i = Number(v);
    const b = state.bookmarks[i];
    if (!b) return;

    stopSpeak(false);
    state.activeIndex = clampIndex(b.index);
    renderReader();
    updateProgress();
    save();
    setStatus(`跳轉到書籤：第 ${state.activeIndex + 1} 句`, "ok");
  });

  els.btnRemoveBookmark.addEventListener("click", removeSelectedBookmark);

  els.chkAutoScroll.addEventListener("change", () => {
    state.autoScroll = els.chkAutoScroll.checked;
    save();
    setStatus(state.autoScroll ? "已開啟自動捲動。" : "已關閉自動捲動。", "ok");
  });

  els.btnClear.addEventListener("click", () => {
    stopSpeak(false);
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  // 避免離開頁面仍在朗讀
  window.addEventListener("visibilitychange", () => {
    if (document.hidden) stopSpeak(false);
  });
}

/* ---------- Init ---------- */
function init() {
  load();

  els.inputText.value = state.textRaw || "";
  els.rate.value = String(state.rate || 1.0);
  els.rateVal.textContent = (state.rate || 1.0).toFixed(1);
  els.chkAutoScroll.checked = state.autoScroll !== false;

  renderReader();
  renderBookmarks();
  updateProgress();
  setControlsPlaying(false);
  els.btnStop.disabled = !state.sentences.length;

  // 取得聲線（有些瀏覽器需要 onvoiceschanged）
  if ("speechSynthesis" in window) {
    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;
  } else {
    setStatus("此瀏覽器不支援朗讀（Speech Synthesis）。", "danger");
  }

  bindEvents();
  registerSW();
}

init();
