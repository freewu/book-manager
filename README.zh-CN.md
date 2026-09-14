# 书架 · 本地电子书管理（Windows / macOS / Linux）

[English](README.md) · **[简体中文](README.zh-CN.md)** · [繁體中文](README.zh-TW.md)

![version](https://img.shields.io/badge/version-v0.1.0-5b7cfa.svg) ![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078d4.svg) ![license](https://img.shields.io/badge/license-MIT-22c55e.svg) ![Wails](https://img.shields.io/badge/Wails-v2-DF0000.svg) ![Go](https://img.shields.io/badge/Go-1.21%2B-00ADD8.svg)

用 Wails v2 + Go + React 写的本地电子书管理应用。扫描本地目录建书架，用标签把书理清楚，epub / pdf / mobi 直接应用内阅读，还有十四个内置小工具收拾 PDF —— 数据只存在你自己的磁盘上，全部装在一个 SQLite 文件里。

![书架](docs/images/book-shelf.png)

## 功能

- **📂 目录扫描** —— 扫描本地目录，自动提取书名、作者、出版社、语言、简介、大小与 MD5，并从书里抽出封面；支持 EPUB、PDF、MOBI、AZW3、KEPUB。
- **📚 书架** —— 封面网格 + 关键词搜索、格式筛选、多标签「或 / 且」筛选与多种排序；卡片上直接显示阅读进度和豆瓣评分，浏览位置也会记住。
- **🏷️ 标签** —— 新建、改名换色、冻结、删除标签，拖拽排出自己的顺序，还能随机配色；或者切到标签云，字号随收录的书本数变大。
- **🌐 豆瓣数据** —— 按书名从豆瓣获取封面、链接、评分与评价人数，可以批量补全，也可以在书籍详情里单本搜索关联。
- **📖 应用内阅读** —— EPUB / KEPUB 用 epub.js，PDF 用 pdf.js，MOBI / AZW3 用内置的 PalmDoc 解压与解析（内嵌图片也能显示）；阅读位置、页数与进度按书记录，加密 PDF 只需输一次密码。
- **🔤 阅读体验** —— 阅读器工具栏里可以随时调整字号，也能打开护眼模式（epub 变暖色纸、PDF 换暖底衬）；两项都只在本次会话生效，不动全局设置。
- **⏱️ 阅读计时** —— 每次阅读都累计到总时长；长时间停在同一页只算 1 分钟，这个闲置上限可以在设置里改。
- **📝 阅读笔记** —— 阅读时选中文字即可加笔记（含原文引用与位置），之后可以查看和删除。
- **🧰 十四个工具** —— 密码、合并、提取页面、修改文档、压缩文档、PDF → EPUB、EPUB → PDF、转存图片……全部离线，只动你自己的文件。
- **🚫 误录管理** —— 把误识别的书标记为误录，下次扫描按路径与 MD5 双重匹配自动跳过，随时可以恢复。
- **📊 统计** —— 书籍数、总体积、累计阅读时长、笔记数，格式分布、最近入库，以及完整的阅读记录列表。
- **🌏 三种语言** —— 界面内置简体中文、繁體中文与 English，设置里随时切换。
- **💾 本地优先** —— 不用注册、不上云、无遥测 —— 所有数据就是 exe 旁边的一个 SQLite 文件。
- **🖥️ 托盘与单实例** —— 关掉窗口只是收进系统托盘；再启动一次只会把已经在跑的窗口唤到前台。

## 截图

### 书架

![书架](docs/images/book-shelf.png)

封面网格、搜索、格式与标签筛选、批量操作。

### 阅读

![阅读](docs/images/reading-log.png)

在读与已读完分开列出，一键继续阅读。

### 标签

![标签](docs/images/tag-manage.png)

拖拽调整顺序，或者切到标签云。

### 统计

![统计](docs/images/stats.png)

阅读时长、格式分布与阅读记录。

### 工具

![工具](docs/images/tools.png)

十四个小工具都在这一页。

### 设置

![设置](docs/images/settings.png)

书架默认值、闲置上限、语言与数据位置。

## 十四个内置工具

全部离线运行，只处理你自己挑选的文件（包括书架上已有的 PDF）。

### PDF

- **🔒 设置密码** —— 给 PDF 加上打开密码。
- **🔓 清除密码** —— 去掉 PDF 的打开密码。
- **🧷 合并 PDF** —— 把多个 PDF 按顺序合并成一个新文件。
- **✂️ 提取页面** —— 挑出 PDF 里的页面，另存成一个新的 PDF。
- **🖼️ 转存图片** —— 把页面导成 PNG / JPEG 图片，可以只导指定页面。
- **📝 修改文档** —— 查看并修改 PDF 的标题、作者、主题与关键词。
- **🗜️ 压缩文档** —— 用 Ghostscript 重写 PDF，按档位降采样图像来减小体积。
- **📗 转存 EPUB** —— 把 PDF 的文字排版成 epub，可选择保存目录。

### EPUB

- **📕 转存 PDF** —— 把 epub 排版成带书签目录的 PDF，内嵌字体、文字可选中。

### 其他

- **🔍 扫描书库** —— 扫描本地目录，把新增的电子书加入书架。
- **🏷️ 标签管理** —— 新建 / 改名换色 / 冻结 / 删除标签，并可按标签查看书籍。
- **🚫 误录管理** —— 查看并恢复被标记为误录的文件。
- **🌐 豆瓣补全** —— 为缺少评分 / 封面的书批量获取豆瓣信息。
- **📂 数据目录** —— book.db 与封面缓存所在位置，可一键打开。

## 快速开始

### 环境要求

- Go 1.21+
- Node.js 18+
- Wails CLI：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Windows：WebView2 运行时（Win10 / 11 自带）
- macOS：未签名，首次打开需执行 `xattr -dr com.apple.quarantine book-manager.app`
- Linux：需要 `libwebkit2gtk-4.1` 与 `libgtk-3`（在 Ubuntu 24.04 上构建，glibc 2.39+）

### 常用命令（just）

```bash
just setup             # 安装前端依赖
just dev               # 开发模式（热重载）
just build             # 生产构建 → src/build/bin/book-manager.exe
just release           # 发布构建 → release/book-manager.exe
just test              # Go 后端测试 + JS 解析器 + i18n 检查
just ui-test           # 前端 UI 冒烟测试（需 Edge + playwright-core）
just icon              # 从 asserts/logo.png 重新生成应用图标
just fmt               # Go 格式化 + 静态检查
just docs              # 重新生成 README 与官网
just site-test         # 用无头浏览器渲染官网，检查链接、图片与语言切换
just push "msg"        # 提交并推送（中文 message）
```

> 详细开发约定见 agents.md —— 每次开发会话结束时必须提交并推送。

## 数据存储

- 数据库：`<数据目录>/book.db` —— SQLite，纯 Go 实现，可用环境变量 `BOOKMANAGER_DATA_DIR` 覆盖目录。
- 封面缓存：`<数据目录>/covers/` 与 `<数据目录>/.image/`。
- 数据目录的查找顺序：exe 旁边的 data/（release/data）→ 当前工作目录 → 用户配置目录。
- Git 中不保留任何用户数据：src/data/、src/build/bin 与 release/ 都已忽略。

## 已知问题：白屏（WebView2 不重绘）

在生产构建（内嵌资源）模式下，新版 WebView2 与本机 GPU 组合可能因 Wails 的 Hide / Show 可见性 workaround 触发不重绘问题：窗口只显示背景色。规避方案内置在 src/platform_windows.go：

```go
app.Windows = &windows.Options{
    WebviewGpuIsDisabled: true, // --disable-gpu，文本类应用无影响
    WebviewUserDataPath: resolveWebviewUserDataPath(dataDir),
},
```

若要诊断此类问题，可用 `wails build -debug` 打开 DevTools，或用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 连接 CDP。

## 版本号

- 当前版本: **v0.1.0**
- 唯一来源：`src/version.go` 里的 `Version` 常量。
- 界面展示：左侧栏底部 + 设置弹窗底部（通过 App.GetVersion() 绑定获取）。
- 发版：改 `src/version.go` 并推送 —— GitHub Actions 自动构建三平台包并建 Release；本地 `just release` 只出 Windows exe。

## 下载

每个版本都由 GitHub Actions 打成三平台免安装包，并把提交信息汇总成 release 说明：Windows 单文件 exe（`book-manager-<版本>-windows-x64.zip`）、macOS 通用 app（`-macos-universal.zip`）、Linux x64 压缩包（`-linux-x64.tar.gz`）。解压即用，数据目录会建在程序旁边。

- [下载最新版](https://github.com/freewu/book-manager/releases/latest)
- [或者到 GitHub 上浏览全部版本](https://github.com/freewu/book-manager/releases)

## License

MIT © 2026 bluefrog · [https://github.com/freewu/book-manager](https://github.com/freewu/book-manager)
