package main

import (
	"errors"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcrypt"
	"bookmanager/internal/util"
)

// PDF 工具的后端绑定（前端 src/frontend/src/tools/pdf-password/、tools/pdf-unlock/）。
//
// 典型流程：
//  1. PickPdfFile / 书架右键拿到文件路径
//  2. PdfInspect 看是否已加密（已加密且密码不对 → needs_password=true）
//  3. SetPdfPassword 写入新密码 / RemovePdfPassword 清除密码
//     （已加密的文件两者都需要先给出当前密码）

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
	path, book, err := a.resolvePdfTarget(opts)
	if err != nil {
		return models.PdfFileInfo{}, err
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

	a.refreshBookFileFacts(book, path)
	return out, nil
}

// RemovePdfPassword strips the open password from a PDF, so that it can be
// read without typing anything. Encrypted files need the current password.
func (a *App) RemovePdfPassword(opts models.PdfProtectOptions) (models.PdfFileInfo, error) {
	path, book, err := a.resolvePdfTarget(opts)
	if err != nil {
		return models.PdfFileInfo{}, err
	}

	info, err := pdfcrypt.Remove(path, opts.CurrentPassword)
	out := pdfInfoToModel(info)
	if err != nil {
		if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
			out.NeedsPassword = true
			return out, nil
		}
		return out, err
	}

	a.refreshBookFileFacts(book, path)
	return out, nil
}

// resolvePdfTarget resolves the file a PDF tool works on: a book from the shelf
// (BookID > 0 uses the path stored on the book, Path is ignored) or a plain
// path. The returned book is non-nil only for the shelf case, where the caller
// has to refresh the stored file facts after an in-place rewrite.
func (a *App) resolvePdfTarget(opts models.PdfProtectOptions) (string, *models.Book, error) {
	if opts.BookID > 0 {
		b, err := a.store.GetBook(opts.BookID)
		if err != nil {
			return "", nil, err
		}
		if !strings.EqualFold(b.Format, "pdf") {
			return "", nil, errors.New("not a pdf book")
		}
		return b.Path, b, nil
	}
	path := strings.TrimSpace(opts.Path)
	if path == "" {
		return "", nil, errors.New("no pdf file selected")
	}
	return path, nil, nil
}

// refreshBookFileFacts refreshes size / hash of a book whose file was rewritten
// in place, so that later scans still recognise it.
func (a *App) refreshBookFileFacts(book *models.Book, path string) {
	if book == nil {
		return
	}
	size, _ := util.FileSize(path)
	hash, _ := util.HashFile(path)
	_ = a.store.UpdateBookFileFacts(book.ID, size, hash)
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
