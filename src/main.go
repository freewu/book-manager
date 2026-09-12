package main

import (
	"context"
	"embed"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

// quitting is set when the user chooses to exit from the tray menu (关闭),
// so the tray exit path still works even though the close button hides to tray.
var quitting atomic.Bool

func main() {
	app := NewApp()
	dataDir := resolveDataDir()

	err := wails.Run(&options.App{
		Title:     "book-manager",
		Width:     1280,
		Height:    820,
		MinWidth:  960,
		MinHeight: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 244, G: 245, B: 250, A: 1},
		OnStartup:        app.startup,
		OnDomReady:       app.domReady,
		OnShutdown:       app.shutdown,
		// Close button quits the app completely so no process lingers after exit.
		// (The tray icon stays available while the app runs.)
		OnBeforeClose: func(ctx context.Context) (preventClose bool) {
			if quitting.Load() {
				return false // real quit from the tray 关闭 menu item
			}
			// Never hide into a tray icon that is not there: if the icon is not
			// registered the window would be unreachable.
			if !trayAvailable() {
				quitting.Store(true)
				return false
			}
			// close button → hide to tray; the tray 关闭 menu is the way to quit
			app.hideToTray()
			return true
		},
		// Only one instance may run; a second launch brings the first to front.
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "com.bookmanager.book-manager",
			OnSecondInstanceLaunch: func(data options.SecondInstanceData) {
				app.showMainWindow()
			},
		},
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewGpuIsDisabled: true, // workaround for WebView2 repaint issue (Hide/Show hack)
			// Dedicated WebView2 profile avoids stale/corrupt caches from the shared Edge profile,
			// a common cause of blank windows in packaged apps.
			WebviewUserDataPath: resolveWebviewUserDataPath(dataDir),
		},
		// Allow right-click contextmenu events to reach the DOM (default menus are
		// suppressed by Wails in production; our own shelf context menu needs them).
		EnableDefaultContextMenu: true,
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

// resolveWebviewUserDataPath 选择 WebView2 的独立缓存目录。
//
// 开发版（book-manager-dev.exe）必须放到项目目录外面：wails dev 会递归监听
// src/，运行时新建的目录一律 watcher.Add()，而 WebView2 启动时会反复创建/
// 删除自己的缓存目录（build/bin/data/webview2/EBWebView/…），一旦 Add 落在
// 已被删掉的目录上，dev 进程就会被 "FATAL: GetFileAttributes: The system
// cannot find the file specified." 直接带走。
// 正式版仍然放在 exe 旁边的 data/ 里，保持绿色版可以整体拷走。
func resolveWebviewUserDataPath(dataDir string) string {
	if !isDevBinary() {
		return filepath.Join(dataDir, "webview2")
	}
	if d := devWebviewUserDataPath(); d != "" {
		return d
	}
	return filepath.Join(dataDir, "webview2")
}

// devWebviewUserDataPath 返回开发版专用的 WebView2 缓存目录（项目外面）；
// 一个都建不出来的话返回空串，由调用方退回数据目录。
func devWebviewUserDataPath() string {
	if cache, err := os.UserCacheDir(); err == nil {
		d := filepath.Join(cache, "book-manager", "webview2-dev")
		if tryMkdir(d) {
			return d
		}
	}
	// 兜底：系统临时目录，总之不要落在源码目录里
	if d, err := os.MkdirTemp("", "bookmanager-webview2-*"); err == nil {
		return d
	}
	return ""
}

// isDevBinary 判断当前跑的是不是 `wails dev` 的产物（book-manager-dev.exe）。
func isDevBinary() bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	return isDevBinaryName(filepath.Base(exe))
}

func isDevBinaryName(base string) bool {
	name := strings.TrimSuffix(strings.ToLower(base), ".exe")
	return strings.HasSuffix(name, "-dev")
}
