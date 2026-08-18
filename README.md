# 书架 · 本地电子书管理

基于 **Wails v2 + React + Vite** 的本地电子书管理应用，数据全部保存在本地 SQLite 数据库中。

## 功能

- 📂 **目录扫描**：扫描指定目录下的电子书（EPUB、PDF、MOBI、AZW3、KEPUB 等），自动提取书名、作者、出版社、语言、简介、大小、MD5 等信息，并从书中提取封面
- 📚 **书架视图**：左侧为搜索 / 格式筛选 / 排序 / 标签栏，右侧为封面网格书架（封面 + 书名 + 作者 + 阅读进度 + 豆瓣评分）
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

### 运行

```bash
just setup   # 安装前端依赖
just dev     # 开发模式（热重载）
just build   # 构建生产版本
just test    # 全部测试（Go + JS 解析器 + UI 冒烟）
just icon    # 从 logo.png 重新生成应用图标
```

> 详细开发约定见 `agents.md`。

### 测试

```bash
go test ./internal/...          # Go 后端单元 / 集成测试
node scripts/test-mobi-parser.js  # JS 端 MOBI 解析器验证
node frontend/ui-smoke.cjs       # 前端 UI 冒烟测试（需 Edge + playwright-core）
```

## 数据存储

数据库文件保存在应用目录下的 `./data/book.db`（可通过环境变量 `BOOKMANAGER_DATA_DIR` 指定位置）：

```
data/
├── book.db          # SQLite 数据库
└── covers/          # 本地封面图片（书籍内提取 / 豆瓣下载）
```

数据库包含：`books`（书籍）、`tags` / `book_tags`（标签）、`notes`（笔记）、
`reading_sessions`（阅读记录）、`misrecords`（误录名单）、`settings`（设置）、`scan_dirs`（扫描目录）。

## 目录结构

```
├── main.go / app.go          # Wails 入口与 App 结构
├── bindings_*.go             # 暴露给前端的方法（书 / 扫描 / 标签 / 笔记 / 阅读 / 豆瓣 / 设置）
├── internal/
│   ├── db/                   # SQLite 存储层（modernc.org/sqlite，纯 Go 无 CGO）
│   ├── parser/               # EPUB / PDF / MOBI 元数据与封面解析
│   ├── scanner/              # 目录遍历、去重、误录过滤
│   ├── douban/               # 豆瓣搜索（subject_search + suggest 双通道）
│   └── models/               # 数据模型
├── cmd/verify/               # 扫描管线端到端验证工具
└── frontend/                 # React + Vite 前端
    └── src/components/
        ├── Reader.tsx        # 阅读器外壳（计时、翻页、进度）
        ├── ReaderEpub.tsx    # epub.js 阅读器
        ├── ReaderPdf.tsx     # pdf.js 阅读器
        └── ReaderMobi.tsx    # 内置 PalmDoc 解压的 MOBI 阅读器
```

## License

MIT
