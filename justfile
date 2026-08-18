# 书架 · 本地电子书管理 — 开发脚本
# 用法: just <recipe>  (just 默认列出全部)

set shell := ["bash", "-uc"]

# wails CLI 路径（Windows）
wails := "/mnt/c/Users/24358/go/bin/wails.exe"
go := "go.exe"
node := "node.exe"
npm := "npm.cmd"

# 默认: 显示可用命令
default:
    @just --list

# 安装前端依赖
setup:
    cd frontend && {{npm}} install

# 开发模式（热重载）
dev:
    {{wails}} dev

# 生产构建（Windows exe）
build:
    {{wails}} build

# 发布构建：产出 ./release/book-manager.exe
release:
    {{wails}} build
    mkdir -p release
    cp build/bin/book-manager.exe release/book-manager.exe
    @echo "✔ 发布产物: release/book-manager.exe"

# 运行全部测试（Go 后端 + JS 解析器 + UI 冒烟）
test: test-go test-js

# Go 后端测试
test-go:
    {{go}} test ./internal/...

# JS 端 MOBI 解析器验证
test-js:
    {{node}} scripts/test-mobi-parser.js

# 前端 UI 冒烟测试（需 Edge + playwright-core）
ui-test:
    cd frontend && {{node}} ui-smoke.cjs

# 重新生成 logo 与各平台图标（logo.png → appicon.png / icon.ico）
icon:
    {{go}} run ./cmd/genlogo

# Go 格式化 + 静态检查
fmt:
    {{go}} fmt ./...
    {{go}} vet ./...

# 提交并推送（message 参数: just push "feat: xxx"）
push message="chore: update":
    git add -A
    git commit -m "{{message}}" || true
    git push origin main
