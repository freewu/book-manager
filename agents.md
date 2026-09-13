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
- **`wails dev` 的 WebView2 缓存必须放在项目外面**（`main.go` 的 `resolveWebviewUserDataPath`）：
  `wails dev` 会递归监听整个 `src/`，运行时新建的**目录**一律 `watcher.Add()`，而 WebView2 启动时会反复
  创建/删除自己的缓存目录（`build/bin/data/webview2/EBWebView/…`），Add 一旦落在刚被删掉的目录上，
  dev 进程会被 `FATAL: GetFileAttributes: The system cannot find the file specified.` 直接带走
  （wails 的 Create 分支只挡 `node_modules`，`.gitignore`/`build/*` 只作用于初始扫描）。
  所以开发版（exe 名带 `-dev`）的 WebView2 数据放到 `%LocalAppData%\book-manager\webview2-dev`，
  正式版仍留在 exe 旁的 `data/webview2`（绿色版可整体拷走）。dev 的 `book.db` / `covers` 不受影响。
- 版本号唯一来源是 `src/version.go` 的 `const Version`；发版时改它并重新 `just release`。

## 项目结构速览

```
src/
  app.go / main.go / bindings_*.go   # Wails 入口 + 前端绑定方法
  internal/{db,parser,scanner,douban,models,pdfcrypt,pdf2epub,epub2pdf,pdfmerge,pdfextract,pdfimage,pdfmeta,pdfcompress}  # 后端逻辑
  frontend/src/components/            # React 组件（书架/阅读器/宿主弹窗）
  frontend/src/tools/<id>/            # 工具插件（define.ts + lib.ts + tools.tsx 或 page.tsx）
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
  page.tsx     # 整页工具：define.ts 里写了 page: '<路由>' 时用它替代 tools.tsx，
               # 默认导出接收 ToolPageProps（tags / onOpenShelf / onChanged）
```

- 宿主 `src/frontend/src/tools/ToolHost.tsx` 由 `App.tsx` 的 `tool: {id, book}` 状态驱动，
  所有入口（工具页卡片、书架右键、统计页误录链接、侧栏 `open-scan` 事件）都走同一个 `openTool(id, book?)`。
- 文案统一放在 `src/frontend/src/i18n.tsx`（define.ts 里只存 key），分类名用 `tools.category.*`。
  工具页顶部有分类筛选（`tools.filterType` / `tools.filterAll`，默认「全部」），分类顺序由 `tools/index.ts` 的
  `TOOL_CATEGORIES` 决定，每个分类的数量从注册表实时统计；工具描述只写工具本身做什么，
  不要再写「书架里右键 xxx 也可进入」（右键子菜单和工具页卡片走的是同一个 `openTool`）。
- **整页工具**：`define.ts` 里声明 `page: 'tags'` 表示这个工具不是弹窗而是一整页
  （`tools/index.ts` 的 `getToolPage(page)` 反查插件、`toolRoute(mod)` 给出路由）。
  此时 `App.tsx` 的 `Page` 联合类型要有对应值，`openTool(id)` 会把导航切到 `page`，
  侧栏条目、书架工具栏按钮、工具页卡片都调同一个 `openTool(id)`，不再各写一套。
  典型例子：`tools/tags/`（标签页，`page: 'tags'`），侧栏「标签」与工具页「标签管理」卡片是同一个页面。
  `scripts/check-i18n.mjs` 也据此检查目录完整性：有 `page` 字段要求 `page.tsx`，否则要求 `tools.tsx`。
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
- PDF 合并（多选 → 合并成一个新文件）在 `src/internal/pdfmerge`（基于 pdfcpu 的 `api.MergeCreateFile`）：
  `Inspect(path, password)` 返回单文件信息（页数 / 是否加密 / 是否需要密码，永不返回 error，读不了就把原因放进 `Error`）；
  `Merge(Options)` 按传入顺序合并，`Options.Bookmarks` 打开时每个源文件生成一级书签（书名即原文件名），
  单文件合并不生成书签。三个约定：
  1. **加密输入先解到临时副本再合并**（复用 `pdfcrypt.DecryptTo`），临时副本放在按序号命名的子目录里并**保留原文件名**，
     这样 pdfcpu 用文件名生成的书签才是用户看到的书名；不同输入可以有不同密码，所以不用 `conf.UserPW`。
  2. `NeedsPassword = 加密 && 没填密码`——用户验证过密码后就不再提示，但合并时仍按 `Encrypted` 走解密。
  3. 输出路径不能是输入之一（`ErrSameFile`）；pdfcpu 是「临时文件写完再替换」，失败不会留下半个文件。
  进度没有逐文件回调，所以分两阶段：先 `prepare`（每个输入一次，解密/校验）再 `merge`，
  绑定转成 `pdfmerge:progress` 事件，UI 不假装逐文件合并进度。
  对应工具 `tools/pdf-merge/`，绑定在 `bindings_pdfmerge.go`
  （`PickPdfFiles` 多选 + `PdfMergeInspect` + `PickOutPdfFile` + `MergePdfs`，可选自动入库）。
- PDF 提取页面（挑出若干页另存成一个新 PDF）在 `src/internal/pdfextract`（基于 pdfcpu 的 `api.CollectFile`）：
  `Inspect(path, password)` 返回 `(pages, encrypted, error)`——读不了就返回 error（不是 PDF → `ErrNotPDF`；
  加密且密码不对 → 包住 `pdfcrypt.ErrPasswordRequired`，绑定据此给出 `needs_password=true` 的数据而不是错误）；
  `Extract(Options)` 把页码**排序去重**后按升序提取，另有 `ErrNoPages` / `ErrNoOutPath` / `ErrSameFile` 与页码越界检查，
  加密输入和合并一样先 `pdfcrypt.DecryptTo` 到临时副本再提取；原来的书签不放进来（页面重排后没意义）。
  缩略图由前端 pdf.js 画（后端没有光栅化能力），所以绑定另外提供 `ReadPdfData`（整份文件 base64，超过 300 MB 直接拒绝预览）。
  对应工具 `tools/pdf-extract/`，绑定在 `bindings_pdfextract.go`
  （`PdfExtractInspect` + `ReadPdfData` + `ExtractPdfPages`，可选自动入库；保存位置复用合并工具的 `PickOutPdfFile`，
  它现在带第三个参数当对话框标题，旧的合并调用点也要一起传）。
  弹窗交互：一次一组 20 页缩略图，翻组（上一组 / 下一组 / 跳到第 N 页）**不会丢已经勾选的页码**，缩略图三档大小，
  点 🔍 放大单页细看（放大时也能选中/翻页），确认后按页码升序写新文件。
- PDF 转存图片（把页面导成 PNG / JPEG）在 `src/internal/pdfimage` —— 后端**只负责落盘**：
  没有光栅化能力（纯 Go、无 CGO），页面由前端 pdf.js 逐页渲染成 canvas，再由 `SavePdfImage` 一页一次写文件。
  `Save(Options{Dir,Prefix,Format,Page,Total,Data})` 里 `FileName` 按总页数位数补零（3 位起，如 `huozhe-001.png`），
  `SanitizePrefix` 去掉 `\/:*?"<>|` 与控制字符并拦掉空/纯点前缀，写盘走「临时文件 + rename」，
  已存在同名文件时照写但在 `Result.Existed` 里报出来（UI 汇总成「覆盖了 N 张同名图片」）。
  对应工具 `tools/pdf-image/`，绑定在 `bindings_pdfimage.go`（只有 `SavePdfImage`；
  选文件 / 读原文件 / 看页数复用 `PickPdfFile` + `ReadPdfData` + `PdfExtractInspect`，选目录复用 `PickOutDir`）。
  弹窗交互：范围输入支持 `1-3,5,8-10` 与开区间写法（留空 = 全部页面），越界/写错就地报错并禁用导出；
  格式 PNG / JPEG（选 JPEG 才出现质量滑块）、DPI 三档 96/150/300；导出中可以「停止」，已导出的页保留；
  单页像素按 4000 万上限钳制，避免高 DPI 大页把内存打爆。
  冒烟会把真实导出的第 1 张 PNG/JPEG 落到 `src/frontend/screens/`（`pdf-image-page1.*`），
  用 Pillow 解码复核「尺寸对得上 + 有深色像素」，证明 pdf.js 渲染出来的不是空画布。
- PDF 修改文档信息（标题 / 作者 / 主题 / 关键词）在 `src/internal/pdfmeta`。
  这一层**绕开 `api.AddProperties*`**：它拒绝 `Keywords`（pdfcpu 把它留给自己的 keywords 命令）也拒绝空值，
  而本工具四个字段一起写、还允许清空；所以自己 `api.ReadValidateAndOptimize` 之后直接调
  `pdfcpu.PropertiesAdd` / `PropertiesRemove` / `KeywordsAdd`，再用 `api.WriteContext` 写出去。
  `Inspect(path, password)` 一次 `api.PDFInfo` 拿齐标题/作者/主题/关键词/创建工具/生成工具/时间/页数/版本；
  `Save(Options)` 只写**真正改动过**的键（其余键包括 Creator 和自定义键原样保留），
  空字符串 = 删掉该键（`PropertiesRemove`），关键词是**覆盖**而不是追加（先把 `ctx.KeywordList` 清空）。
  输出先落到目标目录的临时文件、关掉输入句柄后再 `os.Rename`，所以 Windows 上原地覆盖也不会留下半个文件。
  加密文件不能原地覆盖（`ErrEncryptedInPlace`：解密后写回去等于把密码摘掉了），只能另存为新文件，
  另存时先 `pdfcrypt.DecryptTo` 到临时副本再读。
  几个要知道的行为：pdfcpu 每次重写都会把 `Producer` 换成自己并刷新 `CreationDate`/`ModDate`（`ensureInfoDict`，改不了，UI 里有提示）；
  PDF 2.0 的文件没有 Info 字典时关键词写不进去（`ErrNoInfoDict`）；权限加密（打开不要密码）的文件读得到但同样不能原地覆盖。
  对应工具 `tools/pdf-meta/`（📝，PDF 分类最后一个），绑定在 `bindings_pdfmeta.go`
  （`PdfMetaInspect` + `SavePdfMeta`，另存可自动入库；`nonNil` 保证 `changed`/`keywords` 序列化成 `[]` 而不是 `null`）。
  弹窗交互：改过的字段行内标「已修改」并汇总「已修改 N 项：…」，可一键还原；
  保存方式默认「另存为新文件」（`<原名>-文档信息.pdf`），也可以「覆盖原文件」（带备份警告）；
  只读区展示页数/版本/创建工具/生成工具/时间。
- PDF 压缩文档在 `src/internal/pdfcompress`，两个引擎：
  Ghostscript（`-sDEVICE=pdfwrite`，能按档位降采样图像，压缩明显）和 pdfcpu 无损优化
  （`api.OptimizeContext`，只重写对象流/去重复图片，省得少但完全无损）。
  档位直接映射 Ghostscript 的 `-dPDFSETTINGS=/screen|/ebook|/printer|/prepress`，
  再强制覆盖几个安全项：`-dEmbedAllFonts=true`（`/screen` 默认不嵌字体，中文会掉字）、
  `-dCompressFonts=true`、`-dSubsetFonts=true`、`-dDetectDuplicateImages=true`、
  `-dCompatibilityLevel=1.7`、`-dAutoRotatePages=/None`、`-dQUIET -dSAFER -dBATCH -dNOPAUSE`。
  用户在界面上填了自定义分辨率才显式打开降采样（`-dDownsampleColorImages=true -dColorImageResolution=N`，
  灰度同理，单色取 `max(300, N)`）；「转成灰度」= `-dColorConversionStrategy=/Gray`。
  Ghostscript 找不到时 `Engine=auto` 自动退回 pdfcpu（此时图像参数不起作用，UI 里会置灰并说明）；
  查找顺序 = 设置项 `gs_path` → 注册表 `GS_DLL`（HKLM/HKCU + WOW6432Node + AFPL）→ 环境变量 `BOOKMANAGER_GS`
  → PATH → 常见安装目录，全部 `os.Stat` 过一遍，所以「重新检测」不需要先清掉旧路径。
  两个引擎都**不保留源文件的加密**：压缩加密 PDF 得到的是明文（要保密码请用设置密码工具），
  因此原地覆盖加密文件直接拒绝（`ErrEncryptedInPlace`）；输出先写同目录临时文件，
  重新读一次页数校验通过再 `os.Rename`，覆盖原文件也不会留半个文件。
  Ghostscript 子进程用 `proc_windows.go` 里带 `CREATE_NO_WINDOW` 的 `SysProcAttr` 启动（不闪黑框），
  并且没有逐页进度可用，进度按阶段上报（`prep`/`compress`/`verify`/`done`）。
  对应工具 `tools/pdf-compress/`（🗜️，PDF 分类，order 80），绑定在 `bindings_pdfcompress.go`
  （`PdfCompressInspect` / `CompressPdf` / `DetectGhostscript` / `PickGhostscriptExe`，事件 `pdfcompress:progress`）。
  弹窗交互：先显示 Ghostscript 检测状态（可手动指定 `gswin64c.exe` 或重新检测），
  再选档位 / 可选自定义分辨率与灰度、压缩方式（自动 / Ghostscript / pdfcpu 无损），
  保存方式默认「另存为新文件」（`<原名>-压缩.pdf`）也可以「覆盖原文件」。
- 标签（tag）：表在 `internal/db`（`tags` 表带 `frozen` 列，`ALTER TABLE` 幂等迁移），
  `Tag.Frozen` 一起返回给前端。**冻结语义** = 保留已打标关系，但不再作为可选项出现：
  书籍详情的标签选择器、书架筛选条都会过滤掉冻结标签（已在筛选条里选中的除外，否则看不到筛选条件）；
  前端不做「冻结标签不允许 SetBookTags」的限制（否则已有关系都取消不掉）。
  `CreateTag` / `UpdateTag` 用 `TagName()` 校验并套用默认颜色，重名/空名返回 `ErrTagExists` / `ErrTagNameEmpty`，
  界面据此显示 `tag.errExists` / `tag.errEmpty`（`page.tsx` 里 `ERR_TEXT` 表把后端中文/UNIQUE 错误映射成 key，
  用 `errKey:` 属性写是为了让 `check-i18n.mjs` 认得）。
  标签页就是整页工具 `tools/tags/`（`page: 'tags'`，order 20），三个入口（侧栏「标签」、
  书架工具栏「标签管理」、工具页「标签管理」卡片）都走 `openTool('tags')`；
  页面支持新建 / 改名换色（行内编辑）/ 冻结解冻 / 删除（`window.confirm`），
  点标签的书籍数量调用 `onOpenShelf([id])` → 书架按 `tag_ids` 过滤。
  新建行上有「🎲 随机颜色」按钮（`lib.ts` 的 `randomTagColor()`：色相全随机，
  饱和 55%~74%、明度 44%~55%，避免随出近乎白/黑的颜色，内部 `hslToHex` 转 `#rrggbb`，
  冒烟里断言生成的是合法十六进制色且与默认色不同）。
- 误录管理也是整页工具 `tools/misrecords/`（`page: 'misrecords'`，order 30，无 `tools.tsx`），
  入口是统计页工具栏的「🚫 误录管理」按钮（带 `.mis-badge` 角标）和工具页卡片，
  两个都走 `openTool('misrecords')`。**注意别再写成 `setSt({tool: {id: 'misrecords'}})`**：
  整页工具没有 `Dialog`，`ToolHost` 会直接返回 null，等于点了没反应。
  页面本身：工具栏显示「共 N 条记录」+「全部清除」（有记录时才出现），正文是记录表格
  （文件名/路径/原因/时间 + 逐条「恢复」，空状态给说明），`page.tsx` 用 `useToast` 提示恢复与清空结果。
- 书架支持批量管理（`components/Bookshelf.tsx` 的 `batch-toggle`）：进入批量模式后卡片上出现勾选框，
  点卡片变成勾选（不再打开阅读器）、右键菜单不再弹出；操作条按钮为 全选/取消全选、设置标签、批量删除、退出批量。
  选中集合会在 `books` 变化后自动去掉已经不存在的 id（`useEffect` + 返回原数组避免多余渲染），
  所以删除/刷新后不会残留幽灵选中。后端一次事务处理整批，避免逐本请求：
  `db.SetBooksTags(bookIDs, tagIDs, mode)`（`add` 追加 / `remove` 移除 / `replace` 整组替换，
  常量 `db.TagModeAdd/Remove/Replace`）+ 绑定 `App.SetBooksTags(bookIDs, tagIDs, mode)`；
  `db.DeleteBooks(ids)` 返回真正删掉的行数 + 绑定 `App.DeleteBooks(ids)`（和单本删除一样只删库记录，
  不动磁盘文件，确认文案里写明；`book_tags`/`notes`/`reading_sessions` 靠外键 `ON DELETE CASCADE` 清理，
  SQLite 的 `foreign_keys(1)` pragma 在 `db.Open` 里已开）。
  失败一律整体回滚：`ErrNoBooks`（空选择）/ `ErrTagMode`（未知方式）/ `ErrBookGone` / `ErrTagGone`
  （传进来的书或标签已被删，前端直接弹后端文案）。批量标签弹窗只列非冻结标签（和书籍详情选择器一致）。
- 阅读器（`components/Reader.tsx`）工具栏里，「Aa」按钮直接把当前字号写在按钮上（`Aa 18`，`.font-num`），
  打开书就能看到当前字号，按钮仍然负责展开/收起字号面板（面板里是字号滑杆 + 闲置上限）。
  紧挨着字号按钮右侧是护眼模式开关（`.eye-btn`，`data-testid="reader-eyecare"`，👁，开启时加 `.on` 高亮），
  面板里也有一个同状态的「护眼模式」按钮。
  **护眼模式 = 本次阅读内切到羊皮纸配色（`theme='sepia'`），不改全局主题设置**：
  状态是 `eyeCareOverride: boolean | null`，`null` 表示跟随全局设置（全局本来就是羊皮纸时开关默认打开），
  点击后才写死；关闭时若全局主题是羊皮纸则退回浅色，否则开关看起来像没反应。
  生效范围：`.reader-root.eyecare` 给阅读区铺羊皮纸底色，EPUB / MOBI 靠已有的 `theme='sepia'`
  分支（epubjs `themes.override` / 文本阅读器内联样式）自动跟着变，
  PDF 页面是 canvas，额外用 `filter: sepia(0.22) saturate(0.9) brightness(0.97)` 做暖色处理，
  连 `.pdf-container` 那块硬编码的深灰底衬（`#525659`）也换成暖色纸衬（`#e8dcc2`），
  否则正文是暖的、周围一圈还是冷的深灰。
  工具栏底色刻意不跟着变（深色应用主题下会把文字对比度搞坏）。
- 书架（`components/Bookshelf.tsx`）的滚动位置在会话内记住：打开阅读器时整个书架会被卸载，
  重新挂载后用 `useLayoutEffect` 把 `.shelf` 的 `scrollTop` 放回去（搜索/筛选/排序变化则回到顶部）。
  改这块注意两点：① 保存位置用 `scroll` 监听 + 卸载清理，且清理里只在 `el.isConnected` 时读
  `scrollTop`（passive effect 的清理可能晚于 DOM 摘除，此时读到的是 0）；② 卡片封面用
  `aspect-ratio` 固定高度，网格高度不依赖图片加载，所以挂载即可恢复、不会跳。
- UI 改动后跑 `just ui-test`：它用 playwright-core 加载 `dist/` 并对 `window.go` 打桩，覆盖书架（含滚动位置恢复、批量管理：勾选/全选/批量打标签三种方式/批量删除与取消/冻结标签不进选择器）/统计/扫描/标签页（三个入口、新建/随机颜色/改名换色/冻结解冻/删除、点数量跳筛选）、误录管理页（统计页入口与工具卡片都进整页、逐条恢复、全部清除后回到空状态）/设置/书籍详情/EPUB 阅读器（当前字号显示、字号右侧的护眼模式开关、字号改动后工具栏数字同步）与加密 PDF 阅读器（含护眼模式的页面滤镜）/工具页（分类分组 + 类型筛选）与 PDF 设置·清除密码·转存 EPUB·转存 PDF·合并 PDF·提取页面·转存图片·修改文档·压缩文档 弹窗（含书架右键 EPUB 工具子菜单、合并列表顺序调整与加密文件密码、提取页面的 20 页分组/跨组选择/放大查看、转存图片的页码范围解析/DPI 像素数/JPEG 质量与中途停止、修改文档的原值预填/改动汇总与还原/另存与覆盖两种保存方式/加密文件密码流程、压缩文档的 Ghostscript 检测与手动指定/档位与自定义分辨率/自动退回 pdfcpu/加密文件密码流程）。
  mock 里没有的绑定会回退成空操作（Proxy），所以新增绑定不会直接弄坏冒烟；
  `pdf2epub:progress` / `epub2pdf:progress` / `pdfmerge:progress` 这类事件由 mock 自己塞进 `window.__events` 触发（`EventsOn` 实际调的是 `window.runtime.EventsOnMultiple`）。
  mock 的 `ReadPdfData` 用文件里的 `window.__mkPdf(23)` 现场造一份 23 页的最小 PDF（够真实渲染缩略图，也够测「翻到第二组只剩 3 页」）。
  写 mock 里的反斜杠要按模板字符串规则翻倍：正则里想要 1 个真反斜杠得写 4 个（`\\\\`），字符串里想要 1 个换行得写 2 个反斜杠加 n（`\\n`），否则会被模板字符串提前转义。
  另外十六进制**数值**字面量不能转义：文件里要写 `0xff` 而不是 `0\\xff`（后者会被模板字符串变成 `0` + 裸字符，直接语法错误）。

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
