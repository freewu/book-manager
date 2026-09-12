package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcrypt"
	"bookmanager/internal/pdfextract"
)

// PDF 提取页面工具的后端绑定（前端 src/frontend/src/tools/pdf-extract/）。
//
// 流程：PickPdfFile（或书架右键带入）→ ReadPdfData 把文件交给 pdf.js 渲染缩略图
// → 用户在弹窗里勾页（前端跨组保存选择）→ PickOutPdfFile 选保存位置 →
// ExtractPdfPages 生成只含选中页的新 PDF。
//
// 缩略图由前端的 pdf.js 画（后端没有 PDF 光栅化能力），所以这里只需要把原始
// 字节送过去；加密文件先用 PdfExtractInspect 确认密码。

// maxPdfPreviewBytes 限制交给前端渲染的 PDF 大小：整份文件要经过一次
// base64 的 IPC 传输，过大的文件会把内存吃光，这里直接给个友好提示。
const maxPdfPreviewBytes = 300 << 20 // 300 MB

// PdfExtractInspect reports page count / encryption state of a source PDF.
// An encrypted file without a working password comes back with
// NeedsPassword=true (and Pages=0) instead of an error.
func (a *App) PdfExtractInspect(path, password string) models.PdfExtractInfo {
	path = strings.TrimSpace(path)
	info := models.PdfExtractInfo{Path: path, Name: filepath.Base(path)}
	if path == "" {
		info.Error = "请先选择 PDF 文件"
		return info
	}
	if st, err := os.Stat(path); err != nil {
		info.Error = fmt.Sprintf("文件读取失败：%v", err)
		return info
	} else if st.IsDir() {
		info.Error = "请选择 PDF 文件"
		return info
	} else {
		info.Size = st.Size()
	}

	pages, enc, err := pdfextract.Inspect(path, password)
	info.Pages = pages
	info.Encrypted = enc
	if err != nil {
		info.NeedsPassword = errors.Is(err, pdfcrypt.ErrPasswordRequired)
		info.Error = err.Error()
		return info
	}
	return info
}

// ReadPdfData returns the raw bytes of a PDF file as base64 so the frontend can
// render page thumbnails with pdf.js (the reader uses the same trick).
func (a *App) ReadPdfData(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("请先选择 PDF 文件")
	}
	st, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("文件读取失败：%v", err)
	}
	if st.Size() > maxPdfPreviewBytes {
		return "", fmt.Errorf("文件太大（%.1f MB），无法预览缩略图", float64(st.Size())/(1<<20))
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("文件读取失败：%v", err)
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// ExtractPdfPages writes the selected pages of a PDF into a new file.
func (a *App) ExtractPdfPages(opts models.PdfExtractOptions) (models.PdfExtractResult, error) {
	res, err := pdfextract.Extract(pdfextract.Options{
		Path:     opts.Path,
		Password: opts.Password,
		Pages:    opts.Pages,
		OutPath:  opts.OutPath,
	})
	if err != nil {
		switch {
		case errors.Is(err, pdfextract.ErrNoInput):
			return models.PdfExtractResult{}, errors.New("请先选择要提取页面的 PDF 文件")
		case errors.Is(err, pdfextract.ErrNoPages):
			return models.PdfExtractResult{}, errors.New("请先选择要提取的页面")
		case errors.Is(err, pdfextract.ErrNoOutPath):
			return models.PdfExtractResult{}, errors.New("请选择新 PDF 的保存位置")
		case errors.Is(err, pdfextract.ErrSameFile):
			return models.PdfExtractResult{}, errors.New("保存位置不能是原文件")
		default:
			return models.PdfExtractResult{}, err
		}
	}

	out := models.PdfExtractResult{
		Path:  res.Path,
		Pages: res.Pages,
		Bytes: res.Bytes,
	}
	if opts.AddToShelf {
		out.BookID, out.Added, out.ShelfError = a.addToShelf(res.Path, "pdf")
	}
	return out, nil
}
