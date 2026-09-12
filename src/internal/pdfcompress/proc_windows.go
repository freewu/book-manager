//go:build windows

package pdfcompress

import "syscall"

// hiddenWindow 让 Ghostscript 在后台跑，不弹出控制台黑框。
func hiddenWindow() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
}
