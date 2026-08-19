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
- 提交前运行 `just test`（Go 后端测试 + JS 解析器 + 前端冒烟）。

## 快捷命令

```bash
just test          # 全部测试
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
  internal/{db,parser,scanner,douban,models}  # 后端逻辑
  frontend/src/components/            # React 组件（书架/阅读器/弹窗）
  cmd/genlogo                         # logo 与图标生成
  cmd/verify                          # 扫描管线端到端验证
  wails.json                          # Wails 构建配置
justfile                            # 常用命令（内部均 cd src 执行）
```

## 注意事项

- 修改 `src/frontend/wailsjs/` 下的生成文件时需同步重新生成绑定（`wails dev/build` 会自动处理）。
- 阅读器 JS 端有独立的 MOBI 解析逻辑（`src/frontend/src/components/ReaderMobi.tsx`），
  修改后需跑 `just test-js` 验证（对应 `src/scripts/test-mobi-parser.js`）。
- 豆瓣抓取逻辑改动需保持 `src/internal/douban` 测试通过（含离线 HTML 样例）。
- 验证白屏修复：`just release` 后用真实 exe 启动并截屏检查（像素方差 > 0）。
