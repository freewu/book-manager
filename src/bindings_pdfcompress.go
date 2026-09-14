package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcompress"
	"bookmanager/internal/pdfcrypt"
)

// PDF 压缩工具的后端绑定（前端 src/frontend/src/tools/pdf-compress/）。
//
// PdfCompressInspect 报告源文件信息和本机 Ghostscript 状态，CompressPdf 交给
// Ghostscript 重写文件（这台机器没装 Ghostscript 时退回 pdfcpu 的无损优化），
// 进度通过 pdfcompress:progress 事件上报。

// gsSettingKey 是设置里保存"手动指定的 gswin64c.exe"的键。
const gsSettingKey = "gs_path"

// PdfCompressInspect reports the facts of a source PDF plus the Ghostscript
// installation the compressor would use. An encrypted file whose password is
// missing/wrong comes back with NeedsPassword=true instead of an error.
func (a *App) PdfCompressInspect(path, password string) models.PdfCompressInfo {
	out := models.PdfCompressInfo{
		Path:        strings.TrimSpace(path),
		Ghostscript: gsModel(a.gsHints()...),
	}
	if out.Path == "" {
		out.Error = "请先选择 PDF 文件"
		return out
	}
	if st, err := os.Stat(out.Path); err != nil {
		out.Error = fmt.Sprintf("文件读取失败：%v", err)
		return out
	} else if st.IsDir() {
		out.Error = "请选择 PDF 文件"
		return out
	}

	info, err := pdfcompress.Inspect(out.Path, password)
	out.Name = info.Name
	out.Size = info.Size
	out.Pages = info.Pages
	out.Version = info.Version
	out.Encrypted = info.Encrypted
	if err != nil {
		out.NeedsPassword = errors.Is(err, pdfcrypt.ErrPasswordRequired)
		out.Error = err.Error()
		return out
	}
	return out
}

// CompressPdf shrinks a PDF. It writes to a temporary file next to the target
// first, so overwriting the source cannot leave half a file behind.
func (a *App) CompressPdf(opts models.PdfCompressOptions) (models.PdfCompressResult, error) {
	start := time.Now()
	emit := func(phase string, percent int) {
		a.emitEvent("pdfcompress:progress", models.PdfCompressProgress{
			Phase:   phase,
			Percent: percent,
			Elapsed: time.Since(start).Seconds(),
		})
	}

	res, err := pdfcompress.Compress(pdfcompress.Options{
		Path:      strings.TrimSpace(opts.Path),
		Password:  opts.Password,
		OutPath:   strings.TrimSpace(opts.OutPath),
		Preset:    pdfcompress.Preset(opts.Preset),
		DPI:       clampDPI(opts.DPI),
		Grayscale: opts.Grayscale,
		Engine:    pdfcompress.Engine(opts.Engine),
		GSPath:    a.gsSettingPath(),
		GSHints:   registryGSHints(),
	}, emit)
	if err != nil {
		return models.PdfCompressResult{}, compressError(err)
	}

	out := models.PdfCompressResult{
		Path:         res.Path,
		InPath:       res.InPath,
		InBytes:      res.InBytes,
		OutBytes:     res.OutBytes,
		SavedBytes:   res.SavedBytes,
		SavedPercent: res.SavedPercent,
		Pages:        res.Pages,
		Engine:       res.Engine,
		GSVersion:    res.GSVersion,
		Preset:       res.Preset,
		DPI:          res.DPI,
		InPlace:      res.InPlace,
		Seconds:      res.Seconds,
	}
	if opts.AddToShelf && !res.InPlace {
		out.BookID, out.Added, out.ShelfError = a.addToShelf(res.Path, "pdf")
	}
	return out, nil
}

// DetectGhostscript 重新检测本机的 Ghostscript（界面上的「重新检测」按钮）。
func (a *App) DetectGhostscript() models.PdfCompressGhostscript {
	return gsModel(a.gsHints()...)
}

// PickGhostscriptExe 让用户手动指定 gswin64c.exe，检测通过后存进设置。
// 返回空串表示用户取消了。
func (a *App) PickGhostscriptExe() (string, error) {
	opts := wailsRuntime.OpenDialogOptions{
		Title: "选择 gswin64c.exe",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Ghostscript (gswin64c.exe / gswin32c.exe / gs.exe)", Pattern: "gswin64c.exe;gswin32c.exe;gs.exe"},
		},
	}
	if dir := filepath.Dir(a.gsSettingPath()); dir != "" && dir != "." {
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			opts.DefaultDirectory = dir
		}
	}
	path, err := wailsRuntime.OpenFileDialog(a.ctx, opts)
	if err != nil {
		if err.Error() == "cancelled" || err.Error() == "dialog cancelled" {
			return "", nil
		}
		return "", err
	}
	path = strings.TrimSpace(path)
	if path == "" {
		return "", nil
	}
	gs := pdfcompress.Detect(pdfcompress.Hint{Path: path, Source: pdfcompress.SourceManual})
	if !gs.Found {
		return "", fmt.Errorf("这个文件不能作为 Ghostscript 使用：%s", filepath.Base(path))
	}
	if err := a.config.SetAll(models.Settings{gsSettingKey: gs.Path}); err != nil {
		return gs.Path, fmt.Errorf("保存设置失败：%w", err)
	}
	return gs.Path, nil
}

// gsModel 把检测结果转成前端用的结构。
func gsModel(hints ...pdfcompress.Hint) models.PdfCompressGhostscript {
	gs := pdfcompress.Detect(hints...)
	return models.PdfCompressGhostscript{
		Found:   gs.Found,
		Path:    gs.Path,
		Version: gs.Version,
		Source:  gs.Source,
	}
}

// gsSettingPath 返回用户手动指定的 Ghostscript 路径（可能为空）。
func (a *App) gsSettingPath() string {
	if a.config == nil {
		return ""
	}
	return strings.TrimSpace(a.config.Get(gsSettingKey))
}

// gsHints 收集手动指定和注册表里的 Ghostscript 位置，交给 pdfcompress.Detect
// 依次尝试（环境变量、PATH、常见目录由 Detect 自己兜底）。
func (a *App) gsHints() []pdfcompress.Hint {
	var hints []pdfcompress.Hint
	if path := a.gsSettingPath(); path != "" {
		hints = append(hints, pdfcompress.Hint{Path: path, Source: pdfcompress.SourceManual})
	}
	return append(hints, registryGSHints()...)
}

// clampDPI 限制自定义分辨率，避免把 0 或离谱的值传给 Ghostscript。
func clampDPI(dpi int) int {
	if dpi <= 0 {
		return 0
	}
	if dpi < 36 {
		return 36
	}
	if dpi > 1200 {
		return 1200
	}
	return dpi
}

// compressError 把内部错误翻译成给用户看的中文提示。
func compressError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, pdfcompress.ErrNoInput):
		return errors.New("请先选择要压缩的 PDF 文件")
	case errors.Is(err, pdfcompress.ErrNoOutPath):
		return errors.New("请选择保存位置")
	case errors.Is(err, pdfcompress.ErrNotPDF):
		return errors.New("这个文件不是 PDF")
	case errors.Is(err, pdfcompress.ErrEncryptedInPlace):
		return errors.New("加密的 PDF 不能覆盖原文件（压缩后就没有密码了），请另存为新文件，或先用「清除密码」工具解密")
	case errors.Is(err, pdfcompress.ErrGSMissing):
		return errors.New("没有找到 Ghostscript：请先安装 Ghostscript，或在「压缩设置」里手动指定 gswin64c.exe")
	case errors.Is(err, pdfcompress.ErrGSFailed):
		return fmt.Errorf("Ghostscript 压缩失败：%w", err)
	case errors.Is(err, pdfcompress.ErrPassword):
		return errors.New("PDF 密码不正确或缺失，请输入打开密码后重试")
	case errors.Is(err, pdfcrypt.ErrPasswordRequired):
		return errors.New("PDF 已加密：请输入打开密码后重试")
	case errors.Is(err, pdfcompress.ErrBadOutput):
		return fmt.Errorf("压缩结果不可用：%w", err)
	default:
		return err
	}
}
