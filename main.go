package main

import (
	"embed"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	dataDir := resolveDataDir()

	err := wails.Run(&options.App{
		Title:     "书架 - 本地电子书管理",
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
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewGpuIsDisabled: true, // workaround for WebView2 repaint issue (Hide/Show hack)
			// Dedicated WebView2 profile avoids stale/corrupt caches from the shared Edge profile,
			// a common cause of blank windows in packaged apps.
			WebviewUserDataPath: filepath.Join(dataDir, "webview2"),
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
