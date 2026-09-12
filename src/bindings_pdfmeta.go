package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcrypt"
	"bookmanager/internal/pdfmeta"
)

// PDF 修改文档信息工具的后端绑定（前端 src/frontend/src/tools/pdf-meta/）。
//
// PdfMetaInspect 读出现有的标题 / 作者 / 主题 / 关键词（顺带页数、版本、只读信息），
// SavePdfMeta 只把改动过的键写回 Info 字典：另存为新文件或原地覆盖。

// PdfMetaInspect reports the document info of a source PDF. An encrypted file
// without a working password comes back with NeedsPassword=true instead of an
// error.
func (a *App) PdfMetaInspect(path, password string) models.PdfMetaInfo {
	path = strings.TrimSpace(path)
	if path == "" {
		return models.PdfMetaInfo{Error: "请先选择 PDF 文件"}
	}
	if st, err := os.Stat(path); err != nil {
		return models.PdfMetaInfo{Path: path, Error: fmt.Sprintf("文件读取失败：%v", err)}
	} else if st.IsDir() {
		return models.PdfMetaInfo{Path: path, Error: "请选择 PDF 文件"}
	}

	info, err := pdfmeta.Inspect(path, password)
	if err != nil {
		out := models.PdfMetaInfo{
			Path:          path,
			Name:          info.Name,
			Size:          info.Size,
			Encrypted:     info.Encrypted,
			NeedsPassword: errors.Is(err, pdfcrypt.ErrPasswordRequired),
			Error:         err.Error(),
		}
		return out
	}

	return models.PdfMetaInfo{
		Path:         info.Path,
		Name:         info.Name,
		Size:         info.Size,
		Pages:        info.Pages,
		Version:      info.Version,
		Encrypted:    info.Encrypted,
		Title:        info.Title,
		Author:       info.Author,
		Subject:      info.Subject,
		Keywords:     nonNil(info.Keywords),
		Creator:      info.Creator,
		Producer:     info.Producer,
		CreationDate: info.CreationDate,
		ModDate:      info.ModDate,
	}
}

// SavePdfMeta writes the document info of a PDF. When OutPath equals Path the
// source file is overwritten in place.
func (a *App) SavePdfMeta(opts models.PdfMetaOptions) (models.PdfMetaResult, error) {
	res, err := pdfmeta.Save(pdfmeta.Options{
		Path:     opts.Path,
		Password: opts.Password,
		OutPath:  opts.OutPath,
		Title:    opts.Title,
		Author:   opts.Author,
		Subject:  opts.Subject,
		Keywords: opts.Keywords,
	})
	if err != nil {
		switch {
		case errors.Is(err, pdfmeta.ErrNoInput):
			return models.PdfMetaResult{}, errors.New("请先选择要修改的 PDF 文件")
		case errors.Is(err, pdfmeta.ErrNoOutPath):
			return models.PdfMetaResult{}, errors.New("请选择保存位置")
		case errors.Is(err, pdfmeta.ErrNotPDF):
			return models.PdfMetaResult{}, errors.New("这个文件不是 PDF")
		case errors.Is(err, pdfmeta.ErrNoInfoDict):
			return models.PdfMetaResult{}, errors.New("这个 PDF 2.0 文件没有文档信息字典，改不了关键词")
		case errors.Is(err, pdfmeta.ErrEncryptedInPlace):
			return models.PdfMetaResult{}, errors.New("加密的 PDF 不能覆盖原文件，请另存为新文件")
		default:
			return models.PdfMetaResult{}, err
		}
	}

	out := models.PdfMetaResult{
		Path:    res.Path,
		Bytes:   res.Bytes,
		Changed: nonNil(res.Changed),
		InPlace: res.InPlace,
	}
	if opts.AddToShelf && !res.InPlace {
		out.BookID, out.Added, out.ShelfError = a.addToShelf(res.Path, "pdf")
	}
	return out, nil
}

// nonNil 让空列表在 JSON 里是 [] 而不是 null，前端就不用特判。
func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
