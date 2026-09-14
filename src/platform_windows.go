//go:build windows

package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

// applyPlatformOptions 只做 Windows（WebView2）专属配置；macOS / Linux 用系统
// WebKit，没有对应开关，见 platform_other.go。
func applyPlatformOptions(app *options.App, dataDir string) {
	app.Windows = &windows.Options{
		// WebView2 + 新版 GPU 的老问题：窗口 Hide/Show 之后不重绘（只剩背景色）。
		// --disable-gpu 对纯文本应用没有代价，必须保留（迁移到其他平台时不受影响）。
		WebviewGpuIsDisabled: true,
		// 独立缓存目录，避免共用 Edge profile 的脏缓存导致白屏；
		// dev 版（book-manager-dev）要放到源码目录外面，见 main.go。
		WebviewUserDataPath: resolveWebviewUserDataPath(dataDir),
	}
}
