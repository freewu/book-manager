package main

import (
	"context"
	_ "embed"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

var (
	appCtx   context.Context
	showMain func()
)

// startTray launches the system tray icon + menu in a background goroutine.
// The close button hides to tray, so the tray "退出" is the only way to quit.
func startTray(ctx context.Context, show func()) {
	appCtx = ctx
	showMain = show
	go systray.Run(onTrayReady, onTrayExit)
}

func onTrayReady() {
	systray.SetIcon(trayIcon)
	systray.SetTitle("book-manager")
	systray.SetTooltip("book-manager")

	mShow := systray.AddMenuItem("显示主界面", "显示主界面")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("退出", "退出 book-manager")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				if showMain != nil {
					showMain()
				}
			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

// onTrayExit is invoked after systray.Quit(); it terminates the app.
func onTrayExit() {
	if appCtx != nil {
		runtime.Quit(appCtx)
	}
}
