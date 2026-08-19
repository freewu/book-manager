package main

import (
	"context"
	"embed"
	"path/filepath"
	"sync/atomic"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

// quitting is set when the user chooses to exit from the tray menu (关闭),
// so the tray exit path still works even though the close button now quits
// directly. Kept for defensive purposes / future close-to-tray opt-in.
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
			return false
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
			WebviewUserDataPath: filepath.Join(dataDir, "webview2"),
		},
		// Allow right-click contextmenu events to reach the DOM (default menus are
		// suppressed by Wails in production; our own shelf context menu needs them).
		EnableDefaultContextMenu: true,
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
