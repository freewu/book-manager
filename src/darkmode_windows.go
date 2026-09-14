//go:build windows

package main

import "golang.org/x/sys/windows/registry"

// systemDarkMode 读注册表里的「应用使用浅色主题」开关（AppsUseLightTheme=0 即深色）。
func systemDarkMode() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	v, _, err := k.GetIntegerValue("AppsUseLightTheme")
	if err != nil {
		return false
	}
	return v == 0
}

// systemThemeNeedsBackend 在 Windows 上必须为 true：WebView2 关掉 GPU 之后
// prefers-color-scheme 不跟随系统，只有注册表是可靠答案。
func systemThemeNeedsBackend() bool { return true }
