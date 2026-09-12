package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// dev 版的 WebView2 缓存目录必须落在项目外面，否则 wails dev 的 watcher 会被
// WebView2 反复创建删除的缓存目录搞崩（FATAL: GetFileAttributes ...）。
func TestIsDevBinaryName(t *testing.T) {
	dev := []string{
		"book-manager-dev.exe",
		"book-manager-dev",
		"BOOK-MANAGER-DEV.EXE",
	}
	for _, name := range dev {
		if !isDevBinaryName(name) {
			t.Errorf("isDevBinaryName(%q) = false，期望 true", name)
		}
	}
	release := []string{
		"book-manager.exe",
		"book-manager",
		"book-manager.exe.dev", // 后缀不对，不是 dev 产物
		"dev.exe",
		"",
	}
	for _, name := range release {
		if isDevBinaryName(name) {
			t.Errorf("isDevBinaryName(%q) = true，期望 false", name)
		}
	}
}

func TestResolveWebviewUserDataPathRelease(t *testing.T) {
	// 单测里跑的是 .../pdfmeta.test 之类的名字，走正式版分支：
	// 缓存放回数据目录，绿色版可整体拷贝。
	dir := t.TempDir()
	got := resolveWebviewUserDataPath(dir)
	want := filepath.Join(dir, "webview2")
	if got != want {
		t.Fatalf("resolveWebviewUserDataPath = %q，期望 %q", got, want)
	}
	if !strings.HasPrefix(got, dir) {
		t.Errorf("%q 不在数据目录 %q 里", got, dir)
	}
}

// 直接验证 dev 分支：不能落在数据目录里（数据目录在 src/build/bin，被 wails dev 监听）。
func TestWebviewUserDataPathDevIsOutsideDataDir(t *testing.T) {
	dataDir := `E:\work\github\book-manager\src\build\bin\data`
	devPath := devWebviewUserDataPath()
	if devPath == "" {
		t.Skip("拿不到用户缓存目录，dev 分支走了兜底逻辑")
	}
	if strings.HasPrefix(strings.ToLower(devPath), strings.ToLower(dataDir)) {
		t.Errorf("dev 的 WebView2 缓存落在了数据目录里: %q", devPath)
	}
	if strings.Contains(strings.ToLower(devPath), `book-manager\src`) {
		t.Errorf("dev 的 WebView2 缓存落在了源码目录里: %q", devPath)
	}
	if st, err := os.Stat(devPath); err != nil || !st.IsDir() {
		t.Errorf("目录没建出来: %q %v", devPath, err)
	}
}
