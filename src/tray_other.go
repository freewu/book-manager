//go:build !windows

package main

// 托盘图标只有 Windows 有原生实现（tray_windows.go 直接调 Win32）。
// macOS / Linux 上这里全是空实现：trayIconRegistered() 恒为 false，
// main.go 的 OnBeforeClose 于是让关闭按钮真正退出应用，而不是把窗口藏进
// 一个不存在的托盘图标里。

func startTray(a *App)         {}
func removeTrayIcon()          {}
func setTrayLang(lang string)  {}
func trayIconRegistered() bool { return false }
