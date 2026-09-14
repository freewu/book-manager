//go:build !windows

package main

import "bookmanager/internal/pdfcompress"

// registryGSHints 在 macOS / Linux 上没有注册表可查：Ghostscript 由
// internal/pdfcompress 的检测顺序（手动指定 → BOOKMANAGER_GS → PATH →
// /usr/bin/gs、/usr/local/bin/gs、Homebrew 目录）负责。
func registryGSHints() []pdfcompress.Hint { return nil }
