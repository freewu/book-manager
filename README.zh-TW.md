# 書架 · 本機電子書管理

[English](README.md) · [简体中文](README.zh-CN.md) · **[繁體中文](README.zh-TW.md)**

![version](https://img.shields.io/badge/version-v0.1.0-5b7cfa.svg) ![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078d4.svg) ![license](https://img.shields.io/badge/license-MIT-22c55e.svg) ![Wails](https://img.shields.io/badge/Wails-v2-DF0000.svg) ![Go](https://img.shields.io/badge/Go-1.21%2B-00ADD8.svg)

用 Wails v2 + Go + React 寫的本機電子書管理應用程式。掃描本機目錄建立書架，用標籤把書整理清楚，epub / pdf / mobi 直接在應用程式內閱讀，還有十四個內建小工具整理 PDF —— 資料只存在你自己的磁碟上，全部裝在一個 SQLite 檔案裡。

![書架](docs/images/book-shelf.png)

## 功能

- **📂 目錄掃描** —— 掃描本機目錄，自動擷取書名、作者、出版社、語言、簡介、大小與 MD5，並從書中抽出封面；支援 EPUB、PDF、MOBI、AZW3、KEPUB。
- **📚 書架** —— 封面網格 + 關鍵字搜尋、格式篩選、多標籤「或 / 且」篩選與多種排序；卡片上直接顯示閱讀進度和豆瓣評分，瀏覽位置也會記住。
- **🏷️ 標籤** —— 新增、改名換色、凍結、刪除標籤，拖曳排出自己的順序，還能隨機配色；或者切到標籤雲，字號隨收錄的書本數變大。
- **🌐 豆瓣資料** —— 依書名從豆瓣取得封面、連結、評分與評價人數，可以批次補齊，也可以在書籍詳細資料裡單本搜尋關聯。
- **📖 應用程式內閱讀** —— EPUB / KEPUB 用 epub.js，PDF 用 pdf.js，MOBI / AZW3 用內建的 PalmDoc 解壓與解析（內嵌圖片也能顯示）；閱讀位置、頁數與進度依書記錄，加密 PDF 只需輸入一次密碼。
- **🔤 閱讀體驗** —— 閱讀器工具列裡可以隨時調整字級，也能開啟護眼模式（epub 變暖色紙、PDF 換暖底襯）；兩項都只在本次工作階段生效，不動全域設定。
- **⏱️ 閱讀計時** —— 每次閱讀都累計到總時長；長時間停在同一頁只算 1 分鐘，這個閒置上限可以在設定裡改。
- **📝 閱讀筆記** —— 閱讀時選取文字即可加筆記（含原文引用與位置），之後可以檢視和刪除。
- **🧰 十四個工具** —— 密碼、合併、擷取頁面、修改文件、壓縮文件、PDF → EPUB、EPUB → PDF、轉存圖片……全部離線，只動你自己的檔案。
- **🚫 誤錄管理** —— 把誤判的書標記為誤錄，下次掃描依路徑與 MD5 雙重比對自動跳過，隨時可以還原。
- **📊 統計** —— 書籍數、總體積、累計閱讀時長、筆記數，格式分布、最近入庫，以及完整的閱讀紀錄列表。
- **🌏 三種語言** —— 介面內建繁體中文、简体中文與 English，設定裡隨時切換。
- **💾 本機優先** —— 不用註冊、不上雲、無遙測 —— 所有資料就是 exe 旁邊的一個 SQLite 檔案。
- **🖥️ 系統匣與單一實例** —— 關掉視窗只是收進系統匣；再啟動一次只會把已經在執行的視窗喚到前景。

## 截圖

### 書架

![書架](docs/images/book-shelf.png)

封面網格、搜尋、格式與標籤篩選、批次操作。

### 閱讀

![閱讀](docs/images/reading-log.png)

在讀與已讀完分開列出，一鍵繼續閱讀。

### 標籤

![標籤](docs/images/tag-manage.png)

拖曳調整順序，或者切到標籤雲。

### 統計

![統計](docs/images/stats.png)

閱讀時長、格式分布與閱讀紀錄。

### 工具

![工具](docs/images/tools.png)

十四個小工具都在這一頁。

### 設定

![設定](docs/images/settings.png)

書架預設值、閒置上限、語言與資料位置。

## 十四個內建工具

全部離線執行，只處理你自己挑選的檔案（包含書架上既有的 PDF）。

### PDF

- **🔒 設定密碼** —— 為 PDF 加上開啟密碼。
- **🔓 清除密碼** —— 移除 PDF 的開啟密碼。
- **🧷 合併 PDF** —— 把多個 PDF 依序合併成一個新檔案。
- **✂️ 擷取頁面** —— 挑出 PDF 裡的頁面，另存成一個新的 PDF。
- **🖼️ 轉存圖片** —— 把頁面匯出成 PNG / JPEG 圖片，可以只匯出指定頁面。
- **📝 修改文件** —— 檢視並修改 PDF 的標題、作者、主題與關鍵字。
- **🗜️ 壓縮文件** —— 用 Ghostscript 重寫 PDF，依檔位降採樣影像來縮小體積。
- **📗 轉存 EPUB** —— 把 PDF 的文字排版成 epub，可選擇儲存目錄。

### EPUB

- **📕 轉存 PDF** —— 把 epub 排版成帶書籤目錄的 PDF，內嵌字型、文字可選取。

### 其他

- **🔍 掃描書庫** —— 掃描本機目錄，把新增的電子書加入書架。
- **🏷️ 標籤管理** —— 新增 / 改名換色 / 凍結 / 刪除標籤，並可依標籤檢視書籍。
- **🚫 誤錄管理** —— 檢視並還原被標記為誤錄的檔案。
- **🌐 豆瓣補齊** —— 為缺少評分 / 封面的書批次取得豆瓣資訊。
- **📂 資料目錄** —— book.db 與封面快取所在位置，可一鍵開啟。

## 快速開始

### 環境需求

- Go 1.21+
- Node.js 18+
- Wails CLI：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Windows：WebView2 執行階段（Win10 / 11 內建）

### 常用指令（just）

```bash
just setup             # 安裝前端相依套件
just dev               # 開發模式（熱重載）
just build             # 正式建置 → src/build/bin/book-manager.exe
just release           # 發行建置 → release/book-manager.exe
just test              # Go 後端測試 + JS 解析器 + i18n 檢查
just ui-test           # 前端 UI 冒煙測試（需 Edge + playwright-core）
just icon              # 從 asserts/logo.png 重新產生應用程式圖示
just fmt               # Go 格式化 + 靜態檢查
just docs              # 重新產生 README 與官網
just push "msg"        # 提交並推送（中文 message）
```

> 詳細開發約定見 agents.md —— 每次開發工作結束時必須提交並推送。

## 資料儲存

- 資料庫：`<資料目錄>/book.db` —— SQLite，純 Go 實作，可用環境變數 `BOOKMANAGER_DATA_DIR` 覆寫目錄。
- 封面快取：`<資料目錄>/covers/` 與 `<資料目錄>/.image/`。
- 資料目錄的尋找順序：exe 旁邊的 data/（release/data）→ 目前工作目錄 → 使用者設定目錄。
- Git 中不保留任何使用者資料：src/data/、src/build/bin 與 release/ 都已忽略。

## 已知問題：白畫面（WebView2 不重繪）

在正式建置（內嵌資源）模式下，新版 WebView2 與本機 GPU 組合可能因 Wails 的 Hide / Show 可見性 workaround 觸發不重繪問題：視窗只顯示背景色。規避方案已內建在 main.go：

```go
Windows: &windows.Options{
    WebviewGpuIsDisabled: true, // --disable-gpu，文字類應用程式無影響
},
```

若要診斷這類問題，可用 `wails build -debug` 開啟 DevTools，或用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 連接 CDP。

## 版本號

- 目前版本: **v0.1.0**
- 唯一來源：`src/version.go` 裡的 `Version` 常數。
- 介面顯示：左側欄底部 + 設定視窗底部（透過 App.GetVersion() 綁定取得）。
- 發版：改 `src/version.go` → `just release` → 提交推送。

## 下載

每個版本都是一個綠色版 exe。解壓後直接執行，資料目錄會建在 exe 旁邊。

- [下載最新版](https://github.com/freewu/book-manager/releases/latest)
- [或是到 GitHub 上瀏覽全部版本](https://github.com/freewu/book-manager/releases)

## License

MIT © 2026 bluefrog · [https://github.com/freewu/book-manager](https://github.com/freewu/book-manager)
