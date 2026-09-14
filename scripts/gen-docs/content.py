#!/usr/bin/env python3
"""README 与官网的全部文案（单一数据源）。

改这里的文字后跑 `just docs`，会重新生成：

    README.md / README.zh-CN.md / README.zh-TW.md
    docs/index.html / docs/zh-CN.html / docs/zh-TW.html

约定：
    * 只放文字与截图文件名，不要放 HTML / Markdown 结构（结构在 generate.py）。
    * 文案里的引号统一用「」或 ' ，避免与 generate.py 里的转义打架。
"""

# ---------------------------------------------------------------- 基本常量

REPO = "https://github.com/freewu/book-manager"
VERSION = "v0.1.0"
YEAR = "2026"
AUTHOR = "bluefrog"

# 语言 -> (html lang, README 文件名, 官网文件名, 下拉框显示名, 下拉框里的排序)
LANGS = [
    ("en", "en", "README.md", "index.html", "English"),
    ("zh-CN", "zh-CN", "README.zh-CN.md", "zh-CN.html", "简体中文"),
    ("zh-TW", "zh-TW", "README.zh-TW.md", "zh-TW.html", "繁體中文"),
]

# 官网用到的截图（顺序即展示顺序，说明文字按语言在下面给）
SHOT_FILES = [
    "book-shelf.png",
    "reading-log.png",
    "tag-manage.png",
    "stats.png",
    "tools.png",
    "settings.png",
]

# 官网头部导航：[锚点 id, 显示名]（显示名按语言）
NAV_IDS = ["features", "screenshots", "tools", "start", "download"]

# ------------------------------------------------------------------- 英文

EN = dict(
    name="Book Manager",
    title="Book Manager · Local e-book library (Windows, macOS, Linux)",
    tagline="Your local e-book library — Windows, macOS and Linux",
    intro=(
        "A local-first e-book manager built with Wails v2, Go and React. Point it at your "
        "folders, keep the shelf tidy with tags, read epub / pdf / mobi right inside the app, "
        "and clean up your PDFs with fourteen built-in tools — nothing ever leaves your disk, "
        "everything lives in a single SQLite file."
    ),
    badges=["Wails v2", "Go 1.21+", "React + Vite", "SQLite", "Windows · macOS · Linux", "MIT"],
    nav=["Features", "Screenshots", "Tools", "Quick start", "Download"],
    cta_download="Download the latest release",
    cta_source="View on GitHub",
    cta_note="Windows 10/11 · macOS · Linux · portable, no installer · MIT licensed",
    lang_label="Language",
    readme_link="README",
    features_title="Features",
    shots_title="Screenshots",
    tools_title="Fourteen built-in tools",
    tools_note="Everything runs offline, on files you pick — including the PDFs already on your shelf.",
    start_title="Quick start",
    requirements_title="Requirements",
    commands_title="Handy commands (just)",
    data_title="Data storage",
    known_title="Known issue: blank window (WebView2 stops repainting)",
    version_title="Version",
    version_current="Current version",
    download_title="Download",
    download_text=(
        "Every release ships portable packages for three platforms, built by GitHub Actions and "
        "published with the commit log as its release notes: a single exe for Windows "
        "(`book-manager-<version>-windows-x64.zip`), a universal app for macOS "
        "(`...-macos-universal.zip`) and a tarball for Linux x64 (`...-linux-x64.tar.gz`). "
        "Unzip, run, and the app creates its data folder next to itself."
    ),
    download_button="Get the latest release",
    download_alt="Or browse all releases on GitHub",
    ftr_readme="Readme",
    ftr_issues="Issues",
    ftr_license="License",
    docs_note="Development conventions live in agents.md — every session ends with a commit and a push.",
    version_items=[
        "Single source of truth: the `Version` constant in `src/version.go`.",
        "Shown in the sidebar footer and the settings dialog through the App.GetVersion() binding.",
        "To release: bump `src/version.go` and push — GitHub Actions builds the Windows / macOS / "
        "Linux packages and creates the release. `just release` only builds the local Windows exe.",
    ],
    features=[
        ("📂", "Folder scanning",
         "Scan local folders and pull out title, author, publisher, language, description, size "
         "and MD5, plus the cover art. EPUB, PDF, MOBI, AZW3 and KEPUB are supported."),
        ("📚", "Bookshelf",
         "A cover grid with keyword search, format filter, multi-tag «or / and» filtering and "
         "several sort orders; cards show reading progress and the Douban rating, and the scroll "
         "position is remembered."),
        ("🏷️", "Tags",
         "Create, rename, recolor, freeze or delete tags, drag them into your own order, roll a "
         "random color, or browse them as a tag cloud whose size follows the book count."),
        ("🌐", "Douban metadata",
         "Fetch covers, links, ratings and rating counts from Douban by title — in batches, or one "
         "book at a time from the detail dialog."),
        ("📖", "Built-in reader",
         "EPUB / KEPUB through epub.js, PDF through pdf.js, and MOBI / AZW3 with a built-in "
         "PalmDoc decoder that renders the embedded images too. Position, page count and progress "
         "are recorded per book, and encrypted PDFs ask for the password once."),
        ("🔤", "Comfortable reading",
         "Change the font size from the reader toolbar and flip on eye-care mode for a warm page; "
         "both are session-local, so your global settings stay untouched."),
        ("⏱️", "Reading timer",
         "Every session adds to the total reading time. Staying on one page only counts one "
         "minute, and that idle cap is configurable in Settings."),
        ("📝", "Notes",
         "Select any text while reading to attach a note with its quote and position; notes can be "
         "reviewed and deleted later."),
        ("🧰", "Fourteen tools",
         "Passwords, merge, page extraction, metadata, compression, PDF → EPUB, EPUB → PDF and "
         "image export — all offline, all on your own files."),
        ("🚫", "Misrecords",
         "Mark a mis-detected file as a misrecord and the next scan skips it by path and MD5; "
         "restore it whenever you like."),
        ("📊", "Stats",
         "Totals for books, size, reading time and notes, the format breakdown, the latest "
         "additions and the full list of reading sessions."),
        ("🌏", "Three languages",
         "The interface ships in English, Simplified Chinese and Traditional Chinese."),
        ("💾", "Local-first",
         "No account, no cloud, no telemetry — one SQLite file next to the executable."),
        ("🖥️", "Tray and single instance",
         "Closing the window keeps the app in the system tray, and starting it again simply "
         "reopens the window that is already there."),
    ],
    tool_groups=[
        ("PDF", [
            ("🔒", "Set password", "Set an open password on a PDF."),
            ("🔓", "Remove password", "Remove the open password from a PDF."),
            ("🧷", "Merge PDFs", "Merge several PDFs into one new file, in order."),
            ("✂️", "Extract pages", "Pick pages out of a PDF and save them as a new PDF."),
            ("🖼️", "Export images", "Save PDF pages as PNG / JPEG images, optionally only the pages you name."),
            ("📝", "Edit metadata", "View and edit the title, author, subject and keywords of a PDF."),
            ("🗜️", "Compress", "Rewrite a PDF with Ghostscript, downsampling images per preset to shrink it."),
            ("📗", "PDF → EPUB", "Lay out the text layer of a PDF as an epub, with an optional output folder."),
        ]),
        ("EPUB", [
            ("📕", "EPUB → PDF", "Lay out an epub as a PDF with a bookmark outline, embedded fonts and selectable text."),
        ]),
        ("Other", [
            ("🔍", "Scan library", "Scan local folders and add new e-books to the shelf."),
            ("🏷️", "Manage tags", "Create, recolor, freeze and delete tags; browse books by tag."),
            ("🚫", "Misrecords", "Review and restore files marked as misrecords."),
            ("🌐", "Douban sync", "Batch-fetch Douban information for books missing ratings or covers."),
            ("📂", "Data folder", "Where book.db and the cover cache live, with a button to open it."),
        ]),
    ],
    shots=[
        ("Bookshelf", "Cover grid, search, format and tag filters, batch actions."),
        ("Reading", "Unfinished and finished books, one click to continue."),
        ("Tags", "Drag to reorder the list, or switch to the tag cloud."),
        ("Stats", "Reading time, format breakdown and the session log."),
        ("Tools", "Fourteen utilities on one page."),
        ("Settings", "Shelf defaults, idle cap, language and data location."),
    ],
    requirements=[
        "Go 1.21+",
        "Node.js 18+",
        "Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`",
        "Windows: the WebView2 runtime (already part of Windows 10 / 11)",
        "macOS: unsigned build — run `xattr -dr com.apple.quarantine book-manager.app` on first launch",
        "Linux: `libwebkit2gtk-4.1` and `libgtk-3` (built on Ubuntu 24.04, glibc 2.39+)",
    ],
    commands=[
        ("just setup", "install the frontend dependencies"),
        ("just dev", "dev mode with hot reload"),
        ("just build", "production build → src/build/bin/book-manager.exe"),
        ("just release", "release build → release/book-manager.exe"),
        ("just test", "Go backend tests, JS parsers and the i18n check"),
        ("just ui-test", "headless browser smoke test of the UI (needs Edge + playwright-core)"),
        ("just icon", "regenerate the app icons from asserts/logo.png"),
        ("just fmt", "gofmt and go vet the backend"),
        ("just docs", "regenerate the READMEs and the docs site"),
        ("just site-test", "render the docs site in a headless browser and check every link and image"),
        ('just push "msg"', "commit everything and push to main"),
    ],
    data=[
        "Database: `<data dir>/book.db` — SQLite, pure Go, override the directory with the "
        "`BOOKMANAGER_DATA_DIR` environment variable.",
        "Cover cache: `<data dir>/covers/` and `<data dir>/.image/`.",
        "The data directory is resolved next to the executable first (release/data), then the "
        "working directory, then the user config directory.",
        "No user data is committed: src/data/, src/build/bin and release/ are git-ignored.",
    ],
    known_body=(
        "In production builds (with the assets embedded) some WebView2 + GPU combinations stop "
        "repainting because of the Wails hide / show visibility workaround — the window shows "
        "nothing but its background colour. The workaround lives in src/platform_windows.go:"
    ),
    known_code=[
        "app.Windows = &windows.Options{",
        "    WebviewGpuIsDisabled: true, // --disable-gpu; harmless for a text app",
        "    WebviewUserDataPath: resolveWebviewUserDataPath(dataDir),",
        "},",
    ],
    known_tip=(
        "To diagnose this, build with `wails build -debug` to get DevTools, or attach a debugger "
        "with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`."
    ),
)

# ------------------------------------------------------------------- 简体

ZH_CN = dict(
    name="书架",
    title="书架 · 本地电子书管理（Windows / macOS / Linux）",
    tagline="Windows / macOS / Linux 上的本地电子书库",
    intro=(
        "用 Wails v2 + Go + React 写的本地电子书管理应用。扫描本地目录建书架，用标签把书理清楚，"
        "epub / pdf / mobi 直接应用内阅读，还有十四个内置小工具收拾 PDF —— 数据只存在你自己的磁盘上，"
        "全部装在一个 SQLite 文件里。"
    ),
    badges=["Wails v2", "Go 1.21+", "React + Vite", "SQLite", "Windows · macOS · Linux", "MIT"],
    nav=["功能", "截图", "工具", "快速开始", "下载"],
    cta_download="下载最新版",
    cta_source="在 GitHub 上查看",
    cta_note="Windows 10/11 · macOS · Linux · 免安装绿色版 · MIT 协议",
    lang_label="语言",
    readme_link="说明文档",
    features_title="功能",
    shots_title="截图",
    tools_title="十四个内置工具",
    tools_note="全部离线运行，只处理你自己挑选的文件（包括书架上已有的 PDF）。",
    start_title="快速开始",
    requirements_title="环境要求",
    commands_title="常用命令（just）",
    data_title="数据存储",
    known_title="已知问题：白屏（WebView2 不重绘）",
    version_title="版本号",
    version_current="当前版本",
    download_title="下载",
    download_text=(
        "每个版本都由 GitHub Actions 打成三平台免安装包，并把提交信息汇总成 release 说明："
        "Windows 单文件 exe（`book-manager-<版本>-windows-x64.zip`）、macOS 通用 app"
        "（`-macos-universal.zip`）、Linux x64 压缩包（`-linux-x64.tar.gz`）。"
        "解压即用，数据目录会建在程序旁边。"
    ),
    download_button="下载最新版",
    download_alt="或者到 GitHub 上浏览全部版本",
    ftr_readme="说明文档",
    ftr_issues="问题反馈",
    ftr_license="开源协议",
    docs_note="详细开发约定见 agents.md —— 每次开发会话结束时必须提交并推送。",
    version_items=[
        "唯一来源：`src/version.go` 里的 `Version` 常量。",
        "界面展示：左侧栏底部 + 设置弹窗底部（通过 App.GetVersion() 绑定获取）。",
        "发版：改 `src/version.go` 并推送 —— GitHub Actions 自动构建三平台包并建 Release；本地 `just release` 只出 Windows exe。",
    ],
    features=[
        ("📂", "目录扫描",
         "扫描本地目录，自动提取书名、作者、出版社、语言、简介、大小与 MD5，并从书里抽出封面；"
         "支持 EPUB、PDF、MOBI、AZW3、KEPUB。"),
        ("📚", "书架",
         "封面网格 + 关键词搜索、格式筛选、多标签「或 / 且」筛选与多种排序；卡片上直接显示阅读进度和"
         "豆瓣评分，浏览位置也会记住。"),
        ("🏷️", "标签",
         "新建、改名换色、冻结、删除标签，拖拽排出自己的顺序，还能随机配色；或者切到标签云，"
         "字号随收录的书本数变大。"),
        ("🌐", "豆瓣数据",
         "按书名从豆瓣获取封面、链接、评分与评价人数，可以批量补全，也可以在书籍详情里单本搜索关联。"),
        ("📖", "应用内阅读",
         "EPUB / KEPUB 用 epub.js，PDF 用 pdf.js，MOBI / AZW3 用内置的 PalmDoc 解压与解析（内嵌图片也能显示）；"
         "阅读位置、页数与进度按书记录，加密 PDF 只需输一次密码。"),
        ("🔤", "阅读体验",
         "阅读器工具栏里可以随时调整字号，也能打开护眼模式（epub 变暖色纸、PDF 换暖底衬）；"
         "两项都只在本次会话生效，不动全局设置。"),
        ("⏱️", "阅读计时",
         "每次阅读都累计到总时长；长时间停在同一页只算 1 分钟，这个闲置上限可以在设置里改。"),
        ("📝", "阅读笔记",
         "阅读时选中文字即可加笔记（含原文引用与位置），之后可以查看和删除。"),
        ("🧰", "十四个工具",
         "密码、合并、提取页面、修改文档、压缩文档、PDF → EPUB、EPUB → PDF、转存图片……"
         "全部离线，只动你自己的文件。"),
        ("🚫", "误录管理",
         "把误识别的书标记为误录，下次扫描按路径与 MD5 双重匹配自动跳过，随时可以恢复。"),
        ("📊", "统计",
         "书籍数、总体积、累计阅读时长、笔记数，格式分布、最近入库，以及完整的阅读记录列表。"),
        ("🌏", "三种语言",
         "界面内置简体中文、繁體中文与 English，设置里随时切换。"),
        ("💾", "本地优先",
         "不用注册、不上云、无遥测 —— 所有数据就是 exe 旁边的一个 SQLite 文件。"),
        ("🖥️", "托盘与单实例",
         "关掉窗口只是收进系统托盘；再启动一次只会把已经在跑的窗口唤到前台。"),
    ],
    tool_groups=[
        ("PDF", [
            ("🔒", "设置密码", "给 PDF 加上打开密码。"),
            ("🔓", "清除密码", "去掉 PDF 的打开密码。"),
            ("🧷", "合并 PDF", "把多个 PDF 按顺序合并成一个新文件。"),
            ("✂️", "提取页面", "挑出 PDF 里的页面，另存成一个新的 PDF。"),
            ("🖼️", "转存图片", "把页面导成 PNG / JPEG 图片，可以只导指定页面。"),
            ("📝", "修改文档", "查看并修改 PDF 的标题、作者、主题与关键词。"),
            ("🗜️", "压缩文档", "用 Ghostscript 重写 PDF，按档位降采样图像来减小体积。"),
            ("📗", "转存 EPUB", "把 PDF 的文字排版成 epub，可选择保存目录。"),
        ]),
        ("EPUB", [
            ("📕", "转存 PDF", "把 epub 排版成带书签目录的 PDF，内嵌字体、文字可选中。"),
        ]),
        ("其他", [
            ("🔍", "扫描书库", "扫描本地目录，把新增的电子书加入书架。"),
            ("🏷️", "标签管理", "新建 / 改名换色 / 冻结 / 删除标签，并可按标签查看书籍。"),
            ("🚫", "误录管理", "查看并恢复被标记为误录的文件。"),
            ("🌐", "豆瓣补全", "为缺少评分 / 封面的书批量获取豆瓣信息。"),
            ("📂", "数据目录", "book.db 与封面缓存所在位置，可一键打开。"),
        ]),
    ],
    shots=[
        ("书架", "封面网格、搜索、格式与标签筛选、批量操作。"),
        ("阅读", "在读与已读完分开列出，一键继续阅读。"),
        ("标签", "拖拽调整顺序，或者切到标签云。"),
        ("统计", "阅读时长、格式分布与阅读记录。"),
        ("工具", "十四个小工具都在这一页。"),
        ("设置", "书架默认值、闲置上限、语言与数据位置。"),
    ],
    requirements=[
        "Go 1.21+",
        "Node.js 18+",
        "Wails CLI：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`",
        "Windows：WebView2 运行时（Win10 / 11 自带）",
        "macOS：未签名，首次打开需执行 `xattr -dr com.apple.quarantine book-manager.app`",
        "Linux：需要 `libwebkit2gtk-4.1` 与 `libgtk-3`（在 Ubuntu 24.04 上构建，glibc 2.39+）",
    ],
    commands=[
        ("just setup", "安装前端依赖"),
        ("just dev", "开发模式（热重载）"),
        ("just build", "生产构建 → src/build/bin/book-manager.exe"),
        ("just release", "发布构建 → release/book-manager.exe"),
        ("just test", "Go 后端测试 + JS 解析器 + i18n 检查"),
        ("just ui-test", "前端 UI 冒烟测试（需 Edge + playwright-core）"),
        ("just icon", "从 asserts/logo.png 重新生成应用图标"),
        ("just fmt", "Go 格式化 + 静态检查"),
        ("just docs", "重新生成 README 与官网"),
        ("just site-test", "用无头浏览器渲染官网，检查链接、图片与语言切换"),
        ('just push "msg"', "提交并推送（中文 message）"),
    ],
    data=[
        "数据库：`<数据目录>/book.db` —— SQLite，纯 Go 实现，可用环境变量 `BOOKMANAGER_DATA_DIR` 覆盖目录。",
        "封面缓存：`<数据目录>/covers/` 与 `<数据目录>/.image/`。",
        "数据目录的查找顺序：exe 旁边的 data/（release/data）→ 当前工作目录 → 用户配置目录。",
        "Git 中不保留任何用户数据：src/data/、src/build/bin 与 release/ 都已忽略。",
    ],
    known_body=(
        "在生产构建（内嵌资源）模式下，新版 WebView2 与本机 GPU 组合可能因 Wails 的 Hide / Show "
        "可见性 workaround 触发不重绘问题：窗口只显示背景色。规避方案内置在 src/platform_windows.go："
    ),
    known_code=[
        "app.Windows = &windows.Options{",
        "    WebviewGpuIsDisabled: true, // --disable-gpu，文本类应用无影响",
        "    WebviewUserDataPath: resolveWebviewUserDataPath(dataDir),",
        "},",
    ],
    known_tip=(
        "若要诊断此类问题，可用 `wails build -debug` 打开 DevTools，或用 "
        "`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 连接 CDP。"
    ),
)

# ------------------------------------------------------------------- 繁體

ZH_TW = dict(
    name="書架",
    title="書架 · 本機電子書管理（Windows / macOS / Linux）",
    tagline="Windows / macOS / Linux 上的本機電子書庫",
    intro=(
        "用 Wails v2 + Go + React 寫的本機電子書管理應用程式。掃描本機目錄建立書架，用標籤把書整理清楚，"
        "epub / pdf / mobi 直接在應用程式內閱讀，還有十四個內建小工具整理 PDF —— 資料只存在你自己的磁碟上，"
        "全部裝在一個 SQLite 檔案裡。"
    ),
    badges=["Wails v2", "Go 1.21+", "React + Vite", "SQLite", "Windows · macOS · Linux", "MIT"],
    nav=["功能", "截圖", "工具", "快速開始", "下載"],
    cta_download="下載最新版",
    cta_source="在 GitHub 上檢視",
    cta_note="Windows 10/11 · macOS · Linux · 免安裝綠色版 · MIT 授權",
    lang_label="語言",
    readme_link="說明文件",
    features_title="功能",
    shots_title="截圖",
    tools_title="十四個內建工具",
    tools_note="全部離線執行，只處理你自己挑選的檔案（包含書架上既有的 PDF）。",
    start_title="快速開始",
    requirements_title="環境需求",
    commands_title="常用指令（just）",
    data_title="資料儲存",
    known_title="已知問題：白畫面（WebView2 不重繪）",
    version_title="版本號",
    version_current="目前版本",
    download_title="下載",
    download_text=(
        "每個版本都由 GitHub Actions 打包成三平台免安裝包，並把提交訊息彙整成 release 說明："
        "Windows 單檔 exe（`book-manager-<版本>-windows-x64.zip`）、macOS 通用 app"
        "（`-macos-universal.zip`）、Linux x64 壓縮檔（`-linux-x64.tar.gz`）。"
        "解壓即用，資料目錄會建在程式旁邊。"
    ),
    download_button="下載最新版",
    download_alt="或是到 GitHub 上瀏覽全部版本",
    ftr_readme="說明文件",
    ftr_issues="問題回報",
    ftr_license="授權條款",
    docs_note="詳細開發約定見 agents.md —— 每次開發工作結束時必須提交並推送。",
    version_items=[
        "唯一來源：`src/version.go` 裡的 `Version` 常數。",
        "介面顯示：左側欄底部 + 設定視窗底部（透過 App.GetVersion() 綁定取得）。",
        "發版：改 `src/version.go` 並推送 —— GitHub Actions 會自動建置三平台套件並建立 Release；本機 `just release` 只產出 Windows exe。",
    ],
    features=[
        ("📂", "目錄掃描",
         "掃描本機目錄，自動擷取書名、作者、出版社、語言、簡介、大小與 MD5，並從書中抽出封面；"
         "支援 EPUB、PDF、MOBI、AZW3、KEPUB。"),
        ("📚", "書架",
         "封面網格 + 關鍵字搜尋、格式篩選、多標籤「或 / 且」篩選與多種排序；卡片上直接顯示閱讀進度和"
         "豆瓣評分，瀏覽位置也會記住。"),
        ("🏷️", "標籤",
         "新增、改名換色、凍結、刪除標籤，拖曳排出自己的順序，還能隨機配色；或者切到標籤雲，"
         "字號隨收錄的書本數變大。"),
        ("🌐", "豆瓣資料",
         "依書名從豆瓣取得封面、連結、評分與評價人數，可以批次補齊，也可以在書籍詳細資料裡單本搜尋關聯。"),
        ("📖", "應用程式內閱讀",
         "EPUB / KEPUB 用 epub.js，PDF 用 pdf.js，MOBI / AZW3 用內建的 PalmDoc 解壓與解析（內嵌圖片也能顯示）；"
         "閱讀位置、頁數與進度依書記錄，加密 PDF 只需輸入一次密碼。"),
        ("🔤", "閱讀體驗",
         "閱讀器工具列裡可以隨時調整字級，也能開啟護眼模式（epub 變暖色紙、PDF 換暖底襯）；"
         "兩項都只在本次工作階段生效，不動全域設定。"),
        ("⏱️", "閱讀計時",
         "每次閱讀都累計到總時長；長時間停在同一頁只算 1 分鐘，這個閒置上限可以在設定裡改。"),
        ("📝", "閱讀筆記",
         "閱讀時選取文字即可加筆記（含原文引用與位置），之後可以檢視和刪除。"),
        ("🧰", "十四個工具",
         "密碼、合併、擷取頁面、修改文件、壓縮文件、PDF → EPUB、EPUB → PDF、轉存圖片……"
         "全部離線，只動你自己的檔案。"),
        ("🚫", "誤錄管理",
         "把誤判的書標記為誤錄，下次掃描依路徑與 MD5 雙重比對自動跳過，隨時可以還原。"),
        ("📊", "統計",
         "書籍數、總體積、累計閱讀時長、筆記數，格式分布、最近入庫，以及完整的閱讀紀錄列表。"),
        ("🌏", "三種語言",
         "介面內建繁體中文、简体中文與 English，設定裡隨時切換。"),
        ("💾", "本機優先",
         "不用註冊、不上雲、無遙測 —— 所有資料就是 exe 旁邊的一個 SQLite 檔案。"),
        ("🖥️", "系統匣與單一實例",
         "關掉視窗只是收進系統匣；再啟動一次只會把已經在執行的視窗喚到前景。"),
    ],
    tool_groups=[
        ("PDF", [
            ("🔒", "設定密碼", "為 PDF 加上開啟密碼。"),
            ("🔓", "清除密碼", "移除 PDF 的開啟密碼。"),
            ("🧷", "合併 PDF", "把多個 PDF 依序合併成一個新檔案。"),
            ("✂️", "擷取頁面", "挑出 PDF 裡的頁面，另存成一個新的 PDF。"),
            ("🖼️", "轉存圖片", "把頁面匯出成 PNG / JPEG 圖片，可以只匯出指定頁面。"),
            ("📝", "修改文件", "檢視並修改 PDF 的標題、作者、主題與關鍵字。"),
            ("🗜️", "壓縮文件", "用 Ghostscript 重寫 PDF，依檔位降採樣影像來縮小體積。"),
            ("📗", "轉存 EPUB", "把 PDF 的文字排版成 epub，可選擇儲存目錄。"),
        ]),
        ("EPUB", [
            ("📕", "轉存 PDF", "把 epub 排版成帶書籤目錄的 PDF，內嵌字型、文字可選取。"),
        ]),
        ("其他", [
            ("🔍", "掃描書庫", "掃描本機目錄，把新增的電子書加入書架。"),
            ("🏷️", "標籤管理", "新增 / 改名換色 / 凍結 / 刪除標籤，並可依標籤檢視書籍。"),
            ("🚫", "誤錄管理", "檢視並還原被標記為誤錄的檔案。"),
            ("🌐", "豆瓣補齊", "為缺少評分 / 封面的書批次取得豆瓣資訊。"),
            ("📂", "資料目錄", "book.db 與封面快取所在位置，可一鍵開啟。"),
        ]),
    ],
    shots=[
        ("書架", "封面網格、搜尋、格式與標籤篩選、批次操作。"),
        ("閱讀", "在讀與已讀完分開列出，一鍵繼續閱讀。"),
        ("標籤", "拖曳調整順序，或者切到標籤雲。"),
        ("統計", "閱讀時長、格式分布與閱讀紀錄。"),
        ("工具", "十四個小工具都在這一頁。"),
        ("設定", "書架預設值、閒置上限、語言與資料位置。"),
    ],
    requirements=[
        "Go 1.21+",
        "Node.js 18+",
        "Wails CLI：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`",
        "Windows：WebView2 執行階段（Win10 / 11 內建）",
        "macOS：未簽章，首次開啟需執行 `xattr -dr com.apple.quarantine book-manager.app`",
        "Linux：需要 `libwebkit2gtk-4.1` 與 `libgtk-3`（於 Ubuntu 24.04 建置，glibc 2.39+）",
    ],
    commands=[
        ("just setup", "安裝前端相依套件"),
        ("just dev", "開發模式（熱重載）"),
        ("just build", "正式建置 → src/build/bin/book-manager.exe"),
        ("just release", "發行建置 → release/book-manager.exe"),
        ("just test", "Go 後端測試 + JS 解析器 + i18n 檢查"),
        ("just ui-test", "前端 UI 冒煙測試（需 Edge + playwright-core）"),
        ("just icon", "從 asserts/logo.png 重新產生應用程式圖示"),
        ("just fmt", "Go 格式化 + 靜態檢查"),
        ("just docs", "重新產生 README 與官網"),
        ("just site-test", "用無頭瀏覽器渲染官網，檢查連結、圖片與語言切換"),
        ('just push "msg"', "提交並推送（中文 message）"),
    ],
    data=[
        "資料庫：`<資料目錄>/book.db` —— SQLite，純 Go 實作，可用環境變數 `BOOKMANAGER_DATA_DIR` 覆寫目錄。",
        "封面快取：`<資料目錄>/covers/` 與 `<資料目錄>/.image/`。",
        "資料目錄的尋找順序：exe 旁邊的 data/（release/data）→ 目前工作目錄 → 使用者設定目錄。",
        "Git 中不保留任何使用者資料：src/data/、src/build/bin 與 release/ 都已忽略。",
    ],
    known_body=(
        "在正式建置（內嵌資源）模式下，新版 WebView2 與本機 GPU 組合可能因 Wails 的 Hide / Show "
        "可見性 workaround 觸發不重繪問題：視窗只顯示背景色。規避方案內建在 src/platform_windows.go："
    ),
    known_code=[
        "app.Windows = &windows.Options{",
        "    WebviewGpuIsDisabled: true, // --disable-gpu，文字類應用程式無影響",
        "    WebviewUserDataPath: resolveWebviewUserDataPath(dataDir),",
        "},",
    ],
    known_tip=(
        "若要診斷這類問題，可用 `wails build -debug` 開啟 DevTools，或用 "
        "`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 連接 CDP。"
    ),
)

CONTENT = {"en": EN, "zh-CN": ZH_CN, "zh-TW": ZH_TW}
