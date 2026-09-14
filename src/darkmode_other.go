//go:build !windows

package main

// systemThemeNeedsBackend 在 macOS / Linux 上为 false：WKWebView / WebKitGTK 的
// prefers-color-scheme 本来就跟随系统主题，前端读 matchMedia 就是对的
// （Windows 才需要后端查注册表，见 darkmode_windows.go）。
func systemThemeNeedsBackend() bool { return false }

// systemDarkMode 只在「后端需要给答案」时有意义，这里给保守值：前端会先用
// matchMedia 的结果，不会走到这里。
func systemDarkMode() bool { return false }
