# 讀書朗讀 PWA（免安裝）

功能：
- 貼上文字 → 自動分句
- 逐句普通話朗讀（Speech Synthesis）
- 同步高亮、可點句跳轉
- 語速與聲線選擇
- 書籤與進度（localStorage）
- PWA（GitHub Pages 可直接部署）

## 部署（GitHub Pages）
1. 建立 repo
2. 上傳 index.html / styles.css / app.js / manifest.json / service-worker.js
3. Settings → Pages → Deploy from branch → main / (root)

## 注意
- 朗讀需要使用者手勢觸發（請按播放按鈕）。
- 部分裝置/瀏覽器的普通話聲線名稱不同，可在下拉選單選擇最合適的。
