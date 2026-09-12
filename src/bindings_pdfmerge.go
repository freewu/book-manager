package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfmerge"
)

// PDF 合并工具的后端绑定（前端 src/frontend/src/tools/pdf-merge/）。
//
// 流程：PickPdfFiles 多选文件 → PdfMergeInspect 看每个文件的页数/是否需要密码 →
// PickOutPdfFile 选保存位置 → MergePdfs 合并（pdfmerge:progress 事件回报进度）。
// 单个文件的问题（不是 PDF、缺密码）是数据不是错误，随列表一起返回。

// PickPdfFiles opens a native file picker limited to PDF files. It allows
// selecting several files at once.
func (a *App) PickPdfFiles() ([]string, error) {
	paths, err := wailsRuntime.OpenMultipleFilesDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "选择要合并的 PDF 文件（可多选，按选择顺序合并）",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "PDF (*.pdf)", Pattern: "*.pdf"},
		},
	})
	if err != nil {
		if err.Error() == "cancelled" || err.Error() == "dialog cancelled" {
			return nil, nil
		}
		return nil, err
	}
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out, nil
}

// PdfMergeInspect reports the facts of every picked file. passwords maps a
// path onto an already typed open password (used to confirm it early).
func (a *App) PdfMergeInspect(paths []string, passwords map[string]string) []models.PdfMergeFile {
	out := make([]models.PdfMergeFile, 0, len(paths))
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		info := pdfmerge.Inspect(p, passwords[p])
		out = append(out, models.PdfMergeFile{
			Path:          info.Path,
			Name:          info.Name,
			Size:          info.Size,
			Pages:         info.Pages,
			Encrypted:     info.Encrypted,
			NeedsPassword: info.NeedsPassword,
			Error:         info.Error,
		})
	}
	return out
}

// PickOutPdfFile opens the "save as" dialog for a new PDF. title is the dialog
// caption (the merge and extract tools share this binding).
func (a *App) PickOutPdfFile(defaultName, defaultDir, title string) (string, error) {
	if title = strings.TrimSpace(title); title == "" {
		title = "保存 PDF"
	}
	opts := wailsRuntime.SaveDialogOptions{
		Title: title,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "PDF (*.pdf)", Pattern: "*.pdf"},
		},
	}
	if name := strings.TrimSpace(defaultName); name != "" {
		opts.DefaultFilename = name
	}
	if dir := strings.TrimSpace(defaultDir); dir != "" {
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			opts.DefaultDirectory = dir
		}
	}
	path, err := wailsRuntime.SaveFileDialog(a.ctx, opts)
	if err != nil {
		if err.Error() == "cancelled" || err.Error() == "dialog cancelled" {
			return "", nil
		}
		return "", err
	}
	path = strings.TrimSpace(path)
	// 用户在保存框里可能把扩展名删掉了
	if path != "" && !strings.EqualFold(filepath.Ext(path), ".pdf") {
		path += ".pdf"
	}
	return path, nil
}

// MergePdfs merges the picked files into opts.OutPath. Encrypted inputs are
// decrypted to temporary copies first (the merged file itself is unencrypted).
func (a *App) MergePdfs(opts models.PdfMergeOptions) (models.PdfMergeResult, error) {
	res, err := pdfmerge.Merge(pdfmerge.Options{
		Files:     opts.Files,
		Passwords: opts.Passwords,
		OutPath:   opts.OutPath,
		Bookmarks: opts.Bookmarks,
	}, func(current, total int, name, phase string) {
		a.emitEvent("pdfmerge:progress", models.PdfMergeProgress{
			Current: current,
			Total:   total,
			Name:    name,
			Phase:   phase,
		})
	})
	if err != nil {
		switch {
		case errors.Is(err, pdfmerge.ErrNoFiles):
			return models.PdfMergeResult{}, errors.New("请先选择要合并的 PDF 文件")
		case errors.Is(err, pdfmerge.ErrNoOutPath):
			return models.PdfMergeResult{}, errors.New("请选择合并后的保存位置")
		case errors.Is(err, pdfmerge.ErrSameFile):
			return models.PdfMergeResult{}, errors.New("输出文件不能是待合并的文件之一")
		default:
			return models.PdfMergeResult{}, err
		}
	}

	out := models.PdfMergeResult{
		Path:  res.Path,
		Files: res.Files,
		Pages: res.Pages,
		Bytes: res.Bytes,
	}
	if opts.AddToShelf {
		out.BookID, out.Added, out.ShelfError = a.addToShelf(res.Path, "pdf")
	}
	return out, nil
}
