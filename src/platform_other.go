//go:build !windows

package main

import "github.com/wailsapp/wails/v2/pkg/options"

// applyPlatformOptions 在 macOS / Linux 上什么都不用做：窗口后端是系统 WebKit
// （WKWebView / WebKitGTK），没有 WebView2 的 GPU 开关和缓存目录问题。
func applyPlatformOptions(app *options.App, dataDir string) {}
