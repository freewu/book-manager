//go:build !windows

package pdfcompress

import "syscall"

// hiddenWindow 只在 Windows 上有意义。
func hiddenWindow() *syscall.SysProcAttr { return nil }
