# 书架 · 本地电子书管理

基于 **Wails v2 + React + Vite** 的本地电子书管理应用，数据全部保存在本地 SQLite 数据库中（`src/build/bin/data/book.db`）。

当前版本：**v0.1.0**

## 功能

- 📂 **目录扫描**：扫描指定目录下的电子书（EPUB、PDF、MOBI、AZW3、KEPUB 等），自动提取书名、作者、出版社、语言、简介、大小、MD5 等信息，并从书中提取封面
- 📚 **书架视图**：左侧为搜索 / 格式筛选 / 排序 / 标签栏，右侧为封面网格书架（封面 + 书名 + 作者 + 阅读进度 + 豆瓣评分），底部显示版本号
- 🌐 **豆瓣数据**：按书名从豆瓣获取封面、豆瓣链接、评分与评价人数；支持自动匹配与手动搜索关联
- 🚫 **误录管理**：可将误识别的书标记为「误录」，下次扫描按路径与 MD5 双重匹配自动跳过；可随时恢复
- 📖 **应用内阅读**：
  - EPUB / KEPUB：基于 epub.js 分页阅读，支持跳转进度
  - PDF：基于 pdf.js 分页阅读
  - MOBI / AZW3：内置 PalmDoc 解压与解析，支持文本与内嵌图片
  - 记录阅读位置、页数与进度；自动记忆上次阅读位置
- ⏱️ **阅读计时**：记录累计阅读时长；长时间不翻页只累计 1 分钟（可在设置中修改闲置上限）
- 🏷️ **自定义标签**：标签可自定义名称与颜色，一本书可打多个标签，按标签筛选
- 📝 **阅读笔记**：阅读中选中文字即可添加笔记（含原文引用与位置），支持查看与删除

## 开发

### 环境要求

- Go 1.21+
- Node.js 18+
- Wails CLI（`go install github.com/wailsapp/wails/v2/cmd/wails@latest`）
- Windows：WebView2 Runtime（Win10/11 自带）

### 常用命令（just）

```bash
just setup    # 安装前端依赖
just dev      # 开发模式（热重载）
just build    # 构建生产版本（src/build/bin/book-manager.exe）
just release  # 发布构建 → release/book-manager.exe
just test     # 全部测试（Go 后端 + JS 解析器 + UI 冒烟）
just ui-test  # 前端 UI 冒烟测试（需 Edge + playwright-core）
just icon     # 从 asserts/logo.png 重新生成应用图标（→ build/appicon.png / icon.ico）
just fmt      # Go 格式化 + 静态检查
just push "message"  # 提交并推送（中文 message）
```

> 详细开发约定见 `agents.md`（每次开发会话结束后必须提交并推送）。

### 测试

```bash
just test-go   # Go 后端单元测试（src/internal/...）
just test-js   # JS 端 MOBI 解析器验证（src/scripts/test-mobi-parser.js）
just ui-test   # UI 冒烟测试：真实浏览器（headless Edge）加载前端，验证各弹窗与 EPUB 渲染
```

## 数据存储

- 数据库：`src/build/bin/data/book.db`（SQLite，可通过环境变量 `BOOKMANAGER_DATA_DIR` 覆盖目录）
- 封面缓存：`src/build/bin/data/covers/`
- Git 中不保留任何用户数据（`src/data/` 已在 `.gitignore`）

## 已知问题与规避

### 白屏（WebView2 不渲染）

在生产构建（内嵌资源）模式下，新版 WebView2 与本机 GPU 组合可能因 Wails 的
Hide/Show 可见性 workaround 触发不重绘问题：窗口只显示背景色。规避方案已内置：

```go
Windows: &windows.Options{
    WebviewGpuIsDisabled: true, // --disable-gpu，文本类应用无影响
},
```

若需诊断此类问题，可用 `wails build -debug` 打开 DevTools，或使用
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 连接 CDP。

## 版本号

- 唯一来源：根目录 `version.go` 的 `const Version = "v0.1.0"`
- 界面展示：左侧栏底部 + 设置弹窗底部（通过 `App.GetVersion()` 绑定获取）
- 发版时：修改 `version.go` → `just release` → 提交推送