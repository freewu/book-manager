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
	trayApp  *App
)

// Tray menu labels per language.
type trayLabels struct {
	show    string
	quit    string
	lang    string
	version string
	langs   [3]string
}

func labelsFor(lang string) trayLabels {
	names := [3]string{"简体中文", "繁體中文", "English"}
	// mark the active language
	active := map[string]int{"zh-CN": 0, "zh-TW": 1, "en": 2}[lang]
	for i := range names {
		if i == active {
			names[i] = "✓ " + names[i]
		}
	}
	switch lang {
	case "zh-TW":
		return trayLabels{show: "顯示主界面", quit: "關閉", lang: "語言", version: "版本信息", langs: names}
	case "en":
		return trayLabels{show: "Show main window", quit: "Close", lang: "Language", version: "About", langs: names}
	default: // zh-CN
		return trayLabels{show: "显示主界面", quit: "关闭", lang: "语言", version: "版本信息", langs: names}
	}
}

var (
	trayShowItem    *systray.MenuItem
	trayQuitItem    *systray.MenuItem
	trayLangItem    *systray.MenuItem
	trayVersionItem *systray.MenuItem
	trayLangMenu    [3]*systray.MenuItem
)

// startTray launches the system tray icon + menu in a background goroutine.
// The close button hides to tray, so the tray "退出" is the only way to quit.
func startTray(a *App) {
	appCtx = a.ctx
	showMain = a.showMainWindow
	trayApp = a
	go systray.Run(onTrayReady, onTrayExit)
}

func onTrayReady() {
	systray.SetIcon(trayIcon)
	systray.SetTitle("book-manager")
	systray.SetTooltip("book-manager")

	lang := trayApp.config.Get("language")

	trayShowItem = systray.AddMenuItem("显示主界面", "显示主界面")
	trayLangItem = systray.AddMenuItem("语言", "语言")
	trayLangMenu[0] = trayLangItem.AddSubMenuItem("简体中文", "简体中文")
	trayLangMenu[1] = trayLangItem.AddSubMenuItem("繁體中文", "繁體中文")
	trayLangMenu[2] = trayLangItem.AddSubMenuItem("English", "English")
	systray.AddSeparator()
	trayQuitItem = systray.AddMenuItem("关闭", "关闭 book-manager")
	trayVersionItem = systray.AddMenuItem("版本信息 "+Version, "查看版本信息")

	updateTrayLanguage(lang)

	go func() {
		for {
			select {
			case <-trayShowItem.ClickedCh:
				if showMain != nil {
					showMain()
				}
			case <-trayLangMenu[0].ClickedCh:
				switchTrayLanguage("zh-CN")
			case <-trayLangMenu[1].ClickedCh:
				switchTrayLanguage("zh-TW")
			case <-trayLangMenu[2].ClickedCh:
				switchTrayLanguage("en")
			case <-trayVersionItem.ClickedCh:
				if appCtx != nil {
					// 点击跳转到 GitHub 项目页
					runtime.BrowserOpenURL(appCtx, "https://github.com/freewu/book-manager")
				}
			case <-trayQuitItem.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

// switchTrayLanguage persists the chosen language and notifies the frontend.
func switchTrayLanguage(lang string) {
	if trayApp == nil {
		return
	}
	_ = trayApp.config.Set("language", lang)
	updateTrayLanguage(lang)
	// Tell the frontend to reload settings (re-render with new language).
	if appCtx != nil {
		runtime.EventsEmit(appCtx, "settings:changed", lang)
	}
}

// updateTrayLanguage re-labels the tray menu for the given language.
func updateTrayLanguage(lang string) {
	l := labelsFor(lang)
	if trayShowItem != nil {
		trayShowItem.SetTitle(l.show)
		trayShowItem.SetTooltip(l.show)
	}
	if trayLangItem != nil {
		trayLangItem.SetTitle(l.lang)
		trayLangItem.SetTooltip(l.lang)
	}
	for i, it := range trayLangMenu {
		if it != nil {
			it.SetTitle(l.langs[i])
			it.SetTooltip(l.langs[i])
		}
	}
	if trayQuitItem != nil {
		trayQuitItem.SetTitle(l.quit)
		trayQuitItem.SetTooltip(l.quit)
	}
	if trayVersionItem != nil {
		trayVersionItem.SetTitle(l.version + " " + Version)
		trayVersionItem.SetTooltip(l.version + " " + Version)
	}
}

// onTrayExit is invoked after systray.Quit(); it terminates the app.
func onTrayExit() {
	if appCtx != nil {
		quitting.Store(true)
		runtime.Quit(appCtx)
	}
}
