# agents.md — 开发约定（AI 助手必读）

本文件约束本项目中的 AI 助手 / 代理行为。每次开发任务结束时必须遵守。

## 工作流要求（强制）

1. **每次开发、修改、调试完成后，必须提交 git 并推送到远程仓库。**

   即：任务收尾 = 测试通过 → `git add -A` → `git commit` → `git push origin main`。

2. 不允许出现"改动完成后不提交、不推送"的收尾状态。

## 提交规范

- 提交信息用中文，简洁概括本次变更，例如：
  - `feat: 新增按出版社筛选`
  - `fix: 修复 MOBI 阅读器解压越界`
  - `chore: 更新图标与构建脚本`
- 若改动较多可多行描述（标题 + 要点列表）。
- 提交前运行 `just test`（Go 后端测试 + JS 解析器 + i18n 静态检查）；改了 UI 还要跑 `just ui-test`。

## 快捷命令

```bash
just test          # 全部测试（Go + JS 解析器 + i18n 静态检查）
just ui-test       # 浏览器 UI 冒烟（playwright-core + Edge，发版前必跑）
just build         # 生产构建（wails build）
just release       # 发布构建 → release/book-manager.exe
just dev           # 开发模式（热重载）
just icon          # 重新生成 logo.png → build/appicon.png + icon.ico
just push "feat: xxx"   # 提交并推送
```

## 环境说明

- 项目在 WSL 中开发，Go / Node / Wails 使用 Windows 侧工具链：
  `go.exe`、`node.exe`、`npm.cmd`、`wails.exe`（位于 `/mnt/c/Users/24358/go/bin`）。
- SQLite 用 `modernc.org/sqlite`（纯 Go，无 CGO），Windows 构建无需额外工具链。
- 数据存储在应用目录 `src/build/bin/data/book.db`（基于 exe 路径，可用环境变量 `BOOKMANAGER_DATA_DIR` 覆盖）。
- **白屏规避**：`main.go` 中 `Windows.WebviewGpuIsDisabled: true` 必须保留。
  移除后本机新版 WebView2 + GPU 会不重绘（窗口只剩背景色）。测试过真实 exe 才能确认渲染正常。
- 版本号唯一来源是 `src/version.go` 的 `const Version`；发版时改它并重新 `just release`。

## 项目结构速览

```
src/
  app.go / main.go / bindings_*.go   # Wails 入口 + 前端绑定方法
  internal/{db,parser,scanner,douban,models,pdfcrypt,pdf2epub,epub2pdf}  # 后端逻辑
  frontend/src/components/            # React 组件（书架/阅读器/宿主弹窗）
  frontend/src/tools/<id>/            # 工具插件（define.ts + lib.ts + tools.tsx）
  cmd/genlogo                         # logo 与图标生成
  cmd/verify                          # 扫描管线端到端验证
  wails.json                          # Wails 构建配置
justfile                            # 常用命令（内部均 cd src 执行）
```

## 工具（Tools）插件结构

“工具”页的工具都在 `src/frontend/src/tools/<tool-id>/` 下，一个目录一个工具，**新增工具只需新建目录**
（`src/tools/index.ts` 用 Vite `import.meta.glob` 自动发现，目录名即工具 id）：

```
src/frontend/src/tools/<tool-id>/
  define.ts    # 工具元信息：分类 category（'other' | 'pdf' | 'epub'）、图标 icon、名称/描述 i18n 键、
               # 排序 order、作用格式 bookFormats（书架右键「<分类>工具」子菜单据此显示）
  lib.ts       # 该工具用到的后端调用封装（wails bindings），UI 不直接调 App.*
  tools.tsx    # 工具弹窗组件（默认导出，props 见 tools/types.ts 的 ToolDialogProps）
```

- 宿主 `src/frontend/src/tools/ToolHost.tsx` 由 `App.tsx` 的 `tool: {id, book}` 状态驱动，
  所有入口（工具页卡片、书架右键、统计页误录链接、侧栏 `open-scan` 事件）都走同一个 `openTool(id, book?)`。
- 文案统一放在 `src/frontend/src/i18n.tsx`（define.ts 里只存 key），分类名用 `tools.category.*`。
  工具页顶部有分类筛选（`tools.filterType` / `tools.filterAll`，默认「全部」），分类顺序由 `tools/index.ts` 的
  `TOOL_CATEGORIES` 决定，每个分类的数量从注册表实时统计；工具描述只写工具本身做什么，
  不要再写「书架里右键 xxx 也可进入」（右键子菜单和工具页卡片走的是同一个 `openTool`）。
- 后端绑定按领域放在 `src/bindings_*.go`（如 PDF 工具 = `bindings_pdf.go`）。
- 新增/改绑定后需重新生成 `src/frontend/wailsjs/`（`wails generate module` 或 `wails dev/build` 自动处理）。
- 后端 PDF 加密逻辑在 `src/internal/pdfcrypt`（基于 pdfcpu）：`Inspect` / `Protect`（设置密码）/ `Remove`（清除密码）/ `DecryptTo`（解密副本，给转换用），都有单测，改完跑 `just test`。
  对应两个工具：`tools/pdf-password/`（设置密码）与 `tools/pdf-unlock/`（清除密码），后端绑定都在 `bindings_pdf.go`。
- PDF → EPUB 转换在 `src/internal/pdf2epub`（文字抽取用 `github.com/ledongthuc/pdf`，写 epub 用标准库 `archive/zip`）：
  `Convert(Options)` 把每页的文字片段还原成行 / 段落 / 标题，一页一个 XHTML，再从标题生成目录（标题太少或太多则按页分组）。
  扫描版 PDF 返回 `ErrNoText`（绑定转成 `no_text=true` 数据，不当错误）。
  排版细节：片段按内容流顺序拼接（很多 PDF 的 X 坐标不是真实笔位）、空白/未映射字形当空格、按中位行距判断新段落、
  faux-bold 重绘去重、页眉页脚剔除（见 `layout.go` 顶部常量）。对应工具 `tools/pdf-epub/`，绑定在 `bindings_pdf2epub.go`
  （`PickOutDir` + `ConvertPdfToEpub`，进度走 `pdf2epub:progress` 事件，可选自动入库）。
- EPUB → PDF 转换在 `src/internal/epub2pdf`（解析 epub 用 `golang.org/x/net/html`，排版用 `github.com/phpdave11/gofpdf`）：
  `Convert(Options)` 按 spine 顺序把每个文档的正文排成页面，一章起新页并生成书签目录，可嵌入封面页与中文字体子集，
  纸张支持 A4/A5/B5/16K/LETTER；`Inspect(path)` 返回书名/作者/章节数/字数给弹窗显示。
  没有正文的 epub 返回 `ErrNoText`（绑定转成 `no_text=true` 数据），不是 epub 返回 `ErrNotEPUB`，找不到可嵌入字体返回 `ErrNoFont`。
  两个坑（都已在测试里锁住）：
  1. **绝不能用 gofpdf 的 `MultiCell` 排中文**：它对每个汉字都允许断行，自动换行时会丢掉断点处那一个字
     （`fpdf.go` 里 `i = sep + 1` 跳过）。因此自己实现折行 `text.go`：按字符宽度贪心断行 + 行首/行尾禁则，
     每行单独 `CellFormat(w, h, line, "", 2, align, false, 0, "")`。单测见 `text_test.go`。
  2. 生成的 PDF 用 Type0/Identity-H + 恒等 `/ToUnicode`，rune 即 CID；字体子集保留原轮廓（仅末尾补零对齐）与重映射的复合字形引用。
     **`github.com/ledongthuc/pdf` 读不了我们生成的 CJK PDF**（忽略 ToUnicode → 乱码），pdf.js / Acrobat / pypdf 正常。
  对应工具 `tools/epub-pdf/`，绑定在 `bindings_epub2pdf.go`（`PickEpubFile` + `EpubInspect` + `EpubToPdf`，
  进度走 `epub2pdf:progress` 事件，可选自动入库）。
- 书架（`components/Bookshelf.tsx`）的滚动位置在会话内记住：打开阅读器时整个书架会被卸载，
  重新挂载后用 `useLayoutEffect` 把 `.shelf` 的 `scrollTop` 放回去（搜索/筛选/排序变化则回到顶部）。
  改这块注意两点：① 保存位置用 `scroll` 监听 + 卸载清理，且清理里只在 `el.isConnected` 时读
  `scrollTop`（passive effect 的清理可能晚于 DOM 摘除，此时读到的是 0）；② 卡片封面用
  `aspect-ratio` 固定高度，网格高度不依赖图片加载，所以挂载即可恢复、不会跳。
- UI 改动后跑 `just ui-test`：它用 playwright-core 加载 `dist/` 并对 `window.go` 打桩，覆盖书架（含滚动位置恢复）/统计/扫描/标签/设置/书籍详情/EPUB 与加密 PDF 阅读器/工具页（分类分组 + 类型筛选）与 PDF 设置·清除密码·转存 EPUB·转存 PDF 弹窗（含书架右键 EPUB 工具子菜单）。
  mock 里没有的绑定会回退成空操作（Proxy），所以新增绑定不会直接弄坏冒烟；
  `pdf2epub:progress` / `epub2pdf:progress` 这类事件由 mock 自己塞进 `window.__events` 触发（`EventsOn` 实际调的是 `window.runtime.EventsOnMultiple`）。

## 注意事项

- 修改 `src/frontend/wailsjs/` 下的生成文件时需同步重新生成绑定（`wails dev/build` 会自动处理）。
- 阅读器 JS 端有独立的 MOBI 解析逻辑（`src/frontend/src/components/ReaderMobi.tsx`），
  修改后需跑 `just test-js` 验证（对应 `src/scripts/test-mobi-parser.js`）。
- 豆瓣抓取逻辑改动需保持 `src/internal/douban` 测试通过（含离线 HTML 样例）。
- 验证白屏修复：`just release` 后用真实 exe 启动并截屏检查（像素方差 > 0）。
- 托盘图标是关窗后唯一入口，不能依赖第三方托盘库：实现见 `src/tray.go`（语言/文案）+ `src/tray_windows.go`
  （自建 Win32 消息循环，`runtime.LockOSThread` 固定线程、`TaskbarCreated` 重注册、10s 看门狗）。
  运行时事件写到数据目录 `tray.log`（图标注册/丢失重注册/菜单命令/退出），排查「托盘丢失」先看这个文件。
  修改后必须在真实 exe 上验证：图标在通知区域、左右键可用、关窗后点图标能恢复窗口、托盘菜单「关闭」能退出。
