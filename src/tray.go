package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Shared tray state / labels. The real Windows implementation lives in
// tray_windows.go (own message loop, watchdog, native menu).

var (
	appCtx   context.Context
	showMain func()
	trayApp  *App
)

// Language order used by the tray language submenu.
var (
	trayLangCodes = [3]string{"zh-CN", "zh-TW", "en"}
	trayLangNames = [3]string{"简体中文", "繁體中文", "English"}
)

// trayLabels are the localized tray menu labels.
type trayLabels struct {
	show string
	quit string
	lang string
}

func labelsFor(lang string) trayLabels {
	switch lang {
	case "zh-TW":
		return trayLabels{show: "顯示主界面", quit: "關閉", lang: "語言"}
	case "en":
		return trayLabels{show: "Show main window", quit: "Close", lang: "Language"}
	default: // zh-CN
		return trayLabels{show: "显示主界面", quit: "关闭", lang: "语言"}
	}
}

// switchTrayLanguage persists the chosen language, updates the tray menu and
// notifies the frontend so it re-renders with the new language.
func switchTrayLanguage(lang string) {
	if trayApp == nil {
		return
	}
	_ = trayApp.config.Set("language", lang)
	setTrayLang(lang)
	if appCtx != nil {
		runtime.EventsEmit(appCtx, "settings:changed", lang)
	}
}

// updateTrayLanguage is called when the language setting changes from the UI.
func updateTrayLanguage(lang string) {
	setTrayLang(lang)
}

// trayAvailable reports whether the tray icon is currently registered with the
// shell. When it is not, closing the window must quit instead of hiding to a
// tray icon that the user cannot reach.
func trayAvailable() bool {
	return trayIconRegistered()
}
