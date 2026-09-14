//go:build windows

package main

import (
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/sys/windows/registry"

	"bookmanager/internal/pdfcompress"
)

// registryGSHints 从注册表里找 Ghostscript 安装目录：官方安装程序会写
// HKLM\SOFTWARE\GPL Ghostscript\<版本>\GS_DLL = ...\bin\gsdll64.dll。
func registryGSHints() []pdfcompress.Hint {
	type rootKey struct {
		root registry.Key
		path string
	}
	roots := []rootKey{
		{registry.LOCAL_MACHINE, `SOFTWARE\GPL Ghostscript`},
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\GPL Ghostscript`},
		{registry.LOCAL_MACHINE, `SOFTWARE\AFPL Ghostscript`},
		{registry.CURRENT_USER, `SOFTWARE\GPL Ghostscript`},
	}

	var out []pdfcompress.Hint
	for _, r := range roots {
		key, err := registry.OpenKey(r.root, r.path, registry.READ)
		if err != nil {
			continue
		}
		versions, err := key.ReadSubKeyNames(-1)
		key.Close()
		if err != nil {
			continue
		}
		// 版本号大的先试
		sort.Sort(sort.Reverse(sort.StringSlice(versions)))
		for _, version := range versions {
			sub, err := registry.OpenKey(r.root, r.path+`\`+version, registry.READ)
			if err != nil {
				continue
			}
			dll, _, err := sub.GetStringValue("GS_DLL")
			sub.Close()
			if err != nil || strings.TrimSpace(dll) == "" {
				continue
			}
			dir := filepath.Dir(strings.TrimSpace(dll))
			for _, exe := range []string{"gswin64c.exe", "gswin32c.exe"} {
				out = append(out, pdfcompress.Hint{Path: filepath.Join(dir, exe), Source: pdfcompress.SourceRegistry})
			}
		}
	}
	return out
}
