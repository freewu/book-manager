# 书架 · 本地电子书管理 — 开发脚本
# 用法: just <recipe>  (just 默认列出全部)

set shell := ["bash", "-uc"]

# wails CLI 路径（Windows）
wails := "/mnt/c/Users/24358/go/bin/wails.exe"
go := "go.exe"
node := "node.exe"
npm := "npm.cmd"

# Go 源码目录（main 包 + go.mod + wails.json 所在处）
app := "src"

# 默认: 显示可用命令
default:
    @just --list

# 安装前端依赖
setup:
    cd {{app}}/frontend && {{npm}} install

# 开发模式（热重载）
dev:
    cd {{app}} && {{wails}} dev

# 生产构建（Windows exe）
# wails 的 bindings 生成阶段先于 frontend build，且 //go:embed all:frontend/dist
# 需要目录内存在文件（embed 忽略空目录）——必须手动先构建前端
build:
    cd {{app}}/frontend && cmd.exe /c "npm run build"
    cd {{app}} && {{wails}} build

# 发布构建：产出 ./release/book-manager.exe
release:
    cd {{app}}/frontend && cmd.exe /c "npm run build"
    cd {{app}} && {{wails}} build
    mkdir -p release
    cp {{app}}/build/bin/book-manager.exe release/book-manager.exe
    @echo "✔ 发布产物: release/book-manager.exe"

# 运行全部测试（Go 后端 + JS 解析器 + UI 冒烟）
test: test-go test-js

# Go 后端测试
test-go:
    cd {{app}} && {{go}} test ./internal/...

# JS 端 MOBI 解析器验证
test-js:
    cd {{app}}/frontend && {{node}} scripts/test-mobi-parser.cjs

# 前端 UI 冒烟测试（需 Edge + playwright-core）
ui-test:
    cd {{app}}/frontend && {{node}} ui-smoke.cjs

# 重新生成 logo 与各平台图标（logo.png → appicon.png / icon.ico）
icon:
    cd {{app}} && {{go}} run ./cmd/genlogo

# Go 格式化 + 静态检查
fmt:
    cd {{app}} && {{go}} fmt ./...
    cd {{app}} && {{go}} vet ./...

# 提交并推送（message 参数: just push "feat: xxx"）
push message="chore: update":
    git add -A
    git commit -m "{{message}}" || true
    git push origin main
