package main

import (
	"errors"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcrypt"
	"bookmanager/internal/util"
)

// PDF 工具的后端绑定（前端 src/frontend/src/tools/pdf-password/）。
//
// 典型流程：
//  1. PickPdfFile / 书架右键拿到文件路径
//  2. PdfInspect 看是否已加密（已加密且密码不对 → needs_password=true）
//  3. SetPdfPassword 写入新密码（已加密的文件需要先给出当前密码）

// PickPdfFile opens a native file picker limited to PDF files.
func (a *App) PickPdfFile() (string, error) {
	path, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "选择 PDF 文件",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "PDF (*.pdf)", Pattern: "*.pdf"},
		},
	})
	if err != nil {
		if err.Error() == "cancelled" || err.Error() == "dialog cancelled" {
			return "", nil
		}
		return "", err
	}
	return path, nil
}

// PdfInspect reports the facts of a PDF file. An encrypted file whose
// password is missing/wrong comes back with NeedsPassword=true and no error,
// so the UI can simply ask for the password.
func (a *App) PdfInspect(path, password string) (models.PdfFileInfo, error) {
	info, err := pdfcrypt.Inspect(strings.TrimSpace(path), password)
	out := pdfInfoToModel(info)
	if err != nil {
		if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
			out.NeedsPassword = true
			return out, nil
		}
		return out, err
	}
	return out, nil
}

// SetPdfPassword protects a PDF with a user (open) password. The file is
// replaced only when the new file has been written completely.
func (a *App) SetPdfPassword(opts models.PdfProtectOptions) (models.PdfFileInfo, error) {
	var book *models.Book
	path := strings.TrimSpace(opts.Path)
	if opts.BookID > 0 {
		b, err := a.store.GetBook(opts.BookID)
		if err != nil {
			return models.PdfFileInfo{}, err
		}
		if !strings.EqualFold(b.Format, "pdf") {
			return models.PdfFileInfo{}, errors.New("not a pdf book")
		}
		book = b
		path = b.Path
	}
	if path == "" {
		return models.PdfFileInfo{}, errors.New("no pdf file selected")
	}
	if opts.UserPassword == "" {
		return models.PdfFileInfo{}, errors.New("user password must not be empty")
	}

	info, err := pdfcrypt.Protect(path, pdfcrypt.Options{
		UserPassword:    opts.UserPassword,
		OwnerPassword:   opts.OwnerPassword,
		CurrentPassword: opts.CurrentPassword,
		Strength:        pdfcrypt.Strength(opts.Strength),
		AllowPrint:      opts.AllowPrint,
		AllowCopy:       opts.AllowCopy,
	})
	out := pdfInfoToModel(info)
	if err != nil {
		if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
			// 已加密且当前密码不对：原文件未改动，让用户重填当前密码。
			out.NeedsPassword = true
			return out, nil
		}
		return out, err
	}

	// 书架里的书被就地改写了，刷新 size / hash 以免后续扫描对不上。
	if book != nil {
		size, _ := util.FileSize(path)
		hash, _ := util.HashFile(path)
		_ = a.store.UpdateBookFileFacts(book.ID, size, hash)
	}
	return out, nil
}

// pdfInfoToModel converts the pdfcrypt result into the JSON shape the UI uses.
func pdfInfoToModel(info pdfcrypt.Info) models.PdfFileInfo {
	return models.PdfFileInfo{
		Path:      info.Path,
		Name:      info.Name,
		Size:      info.Size,
		Pages:     info.Pages,
		Title:     info.Title,
		Encrypted: info.Encrypted,
	}
}
